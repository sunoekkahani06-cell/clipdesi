const express = require('express');
const cors = require('cors');
const axios = require('axios');

const app = express();
app.use(cors());
app.use(express.json());

const ASSEMBLYAI_KEY = process.env.ASSEMBLYAI_API_KEY;

app.get('/', (req, res) => {
  res.json({ status: 'ClipDesi Backend Running!' });
});

app.post('/process', async (req, res) => {
  try {
    const { videoUrl, language, clipCount } = req.body;
    if (!videoUrl) {
      return res.status(400).json({ error: 'YouTube URL required' });
    }

    // Step 1: Submit for transcription
    const submitRes = await axios.post(
      'https://api.assemblyai.com/v2/transcript',
      {
        audio_url: videoUrl,
        language_code: language === 'Hindi' ? 'hi' : 'en',
        auto_chapters: true,
        sentiment_analysis: true
      },
      { headers: { authorization: ASSEMBLYAI_KEY } }
    );

    const transcriptId = submitRes.data.id;

    // Step 2: Poll for result
    let transcript = null;
    for (let i = 0; i < 30; i++) {
      await new Promise(r => setTimeout(r, 3000));
      const pollRes = await axios.get(
        `https://api.assemblyai.com/v2/transcript/${transcriptId}`,
        { headers: { authorization: ASSEMBLYAI_KEY } }
      );
      if (pollRes.data.status === 'completed') {
        transcript = pollRes.data;
        break;
      }
      if (pollRes.data.status === 'error') {
        throw new Error('Transcription failed');
      }
    }

    if (!transcript) {
      return res.status(500).json({ error: 'Processing timeout' });
    }

    // Step 3: Generate clips from chapters
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

    res.json({ success: true, clips, totalChapters: chapters.length });

  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`ClipDesi running on port ${PORT}`));
