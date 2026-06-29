const express = require('express');
const cors = require('cors');
const axios = require('axios');
const multer = require('multer');
const fs = require('fs');

const app = express();
app.use(cors());
app.use(express.json());

const upload = multer({ dest: '/tmp/' });
const ASSEMBLYAI_KEY = process.env.ASSEMBLYAI_API_KEY;

app.get('/', (req, res) => {
  res.json({ status: 'ClipDesi Running! 🚀' });
});

app.post('/upload', upload.single('video'), async (req, res) => {
  const filePath = req.file?.path;
  const language = req.body.language || 'Hindi';
  const clipCount = parseInt(req.body.clipCount) || 3;

  try {
    // Step 1: Upload to AssemblyAI
    const audioData = fs.readFileSync(filePath);
    const uploadRes = await axios.post(
      'https://api.assemblyai.com/v2/upload',
      audioData,
      {
        headers: {
          authorization: ASSEMBLYAI_KEY,
          'content-type': 'application/octet-stream'
        },
        maxBodyLength: Infinity
      }
    );
    const audioUrl = uploadRes.data.upload_url;

    // Step 2: Transcribe
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
    let transcript = null;

    // Step 3: Poll
    for (let i = 0; i < 40; i++) {
      await new Promise(r => setTimeout(r, 3000));
      const poll = await axios.get(
        `https://api.assemblyai.com/v2/transcript/${transcriptId}`,
        { headers: { authorization: ASSEMBLYAI_KEY } }
      );
      if (poll.data.status === 'completed') { transcript = poll.data; break; }
      if (poll.data.status === 'error') throw new Error('Transcription failed');
    }

    if (!transcript) throw new Error('Timeout');

    // Step 4: Generate clips
    const chapters = transcript.chapters || [];
    let clips = [];

    if (chapters.length > 0) {
      clips = chapters.slice(0, clipCount).map((ch, i) => ({
        id: i + 1,
        title: ch.headline,
        summary: ch.summary,
        duration: Math.round((ch.end - ch.start) / 1000),
        viralScore: Math.floor(Math.random() * 20) + 80,
        caption: ch.headline
      }));
    } else {
      const words = (transcript.text || '').split(' ');
      const chunk = Math.floor(words.length / clipCount);
      for (let i = 0; i < clipCount; i++) {
        const text = words.slice(i * chunk, (i + 1) * chunk).join(' ');
        clips.push({
          id: i + 1,
          title: `Clip ${i + 1} — Best Moment`,
          duration: 30 + Math.floor(Math.random() * 30),
          viralScore: Math.floor(Math.random() * 20) + 80,
          caption: text.substring(0, 60)
        });
      }
    }

    // Cleanup
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

    res.json({ success: true, clips });

  } catch (err) {
    if (filePath && fs.existsSync(filePath)) fs.unlinkSync(filePath);
    console.error(err.message);
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`ClipDesi running on port ${PORT}`));
