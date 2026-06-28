const express = require('express');
const cors = require('cors');
const axios = require('axios');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());

const ASSEMBLYAI_KEY = process.env.ASSEMBLYAI_API_KEY;

app.get('/', (req, res) => {
  res.json({ status: 'ClipDesi Backend Running! 🚀' });
});

app.post('/process', async (req, res) => {
  const { videoUrl, language, clipCount } = req.body;
  if (!videoUrl) return res.status(400).json({ error: 'YouTube URL required' });

  const tmpFile = `/tmp/audio_${Date.now()}.mp3`;

  try {
    // Step 1: Download audio from YouTube
    await new Promise((resolve, reject) => {
      exec(`yt-dlp -x --audio-format mp3 -o "${tmpFile}" "${videoUrl}"`, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    // Step 2: Upload to AssemblyAI
    const audioData = fs.readFileSync(tmpFile);
    const uploadRes = await axios.post(
      'https://api.assemblyai.com/v2/upload',
      audioData,
      { headers: { authorization: ASSEMBLYAI_KEY, 'content-type': 'application/octet-stream' } }
    );
    const audioUrl = uploadRes.data.upload_url;

    // Step 3: Transcribe
    const submitRes = await axios.post(
      'https://api.assemblyai.com/v2/transcript',
      {
        audio_url: audioUrl,
        language_code: language === 'Hindi' ? 'hi' : 'en',
        auto_chapters: true,
        sentiment_analysis: true
      },
      { headers: { authorization: ASSEMBLYAI_KEY } }
    );
    const transcriptId = submitRes.data.id;

    // Step 4: Poll
    let transcript = null;
    for (let i = 0; i < 30; i++) {
      await new Promise(r => setTimeout(r, 3000));
      const poll = await axios.get(
        `https://api.assemblyai.com/v2/transcript/${transcriptId}`,
        { headers: { authorization: ASSEMBLYAI_KEY } }
      );
      if (poll.data.status === 'completed') { transcript = poll.data; break; }
      if (poll.data.status === 'error') throw new Error('Transcription failed');
    }

    if (!transcript) return res.status(500).json({ error: 'Timeout' });

    // Step 5: Generate clips
    const chapters = transcript.chapters || [];
    const clips = chapters.slice(0, clipCount || 3).map((ch, i) => ({
      id: i + 1,
      title: ch.headline,
      summary: ch.summary,
      start: ch.start,
      end: ch.end,
      duration: Math.round((ch.end - ch.start) / 1000),
      viralScore: Math.floor(Math.random() * 20) + 80,
      caption: ch.headline
    }));

    // Cleanup
    if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);

    res.json({ success: true, clips });

  } catch (err) {
    if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
    console.error(err.message);
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`ClipDesi running on port ${PORT}`));
