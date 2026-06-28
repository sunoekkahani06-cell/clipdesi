const express = require('express');
const cors = require('cors');
const axios = require('axios');

const app = express();
app.use(cors());
app.use(express.json());

const ASSEMBLYAI_KEY = process.env.ASSEMBLYAI_API_KEY;
const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY;

app.get('/', (req, res) => {
  res.json({ status: 'ClipDesi Backend Running! 🚀' });
});

app.post('/process', async (req, res) => {
  const { videoUrl, language, clipCount } = req.body;
  if (!videoUrl) return res.status(400).json({ error: 'YouTube URL required' });

  try {
    // YouTube video ID निकालो
    const videoId = videoUrl.match(/(?:v=|youtu\.be\/)([^&\n?#]+)/)?.[1];
    if (!videoId) return res.status(400).json({ error: 'Invalid YouTube URL' });

    // RapidAPI से transcript लो
    const transcriptRes = await axios.get(
      `https://youtube-transcript3.p.rapidapi.com/api/transcript`,
      {
        params: { videoId },
        headers: {
          'x-rapidapi-key': RAPIDAPI_KEY,
          'x-rapidapi-host': 'youtube-transcript3.p.rapidapi.com'
        }
      }
    );

    const transcriptData = transcriptRes.data;
    const fullText = transcriptData.transcript
      ?.map(t => t.text).join(' ') || '';

    if (!fullText) return res.status(400).json({ error: 'Transcript नहीं मिला' });

    // AssemblyAI से chapters बनाओ
    const submitRes = await axios.post(
      'https://api.assemblyai.com/v2/transcript',
      {
        audio_url: `https://www.youtube.com/watch?v=${videoId}`,
        language_code: language === 'Hindi' ? 'hi' : 'en',
        auto_chapters: true
      },
      { headers: { authorization: ASSEMBLYAI_KEY } }
    );

    const transcriptId = submitRes.data.id;
    let transcript = null;

    for (let i = 0; i < 40; i++) {
      await new Promise(r => setTimeout(r, 3000));
      const poll = await axios.get(
        `https://api.assemblyai.com/v2/transcript/${transcriptId}`,
        { headers: { authorization: ASSEMBLYAI_KEY } }
      );
      if (poll.data.status === 'completed') { transcript = poll.data; break; }
      if (poll.data.status === 'error') break;
    }

    // Chapters से clips बनाओ
    const count = parseInt(clipCount) || 3;
    let clips = [];

    if (transcript?.chapters?.length > 0) {
      clips = transcript.chapters.slice(0, count).map((ch, i) => ({
        id: i + 1,
        title: ch.headline,
        summary: ch.summary,
        duration: Math.round((ch.end - ch.start) / 1000),
        viralScore: Math.floor(Math.random() * 20) + 80,
        caption: ch.headline
      }));
    } else {
      // Chapters नहीं मिले तो transcript से clips बनाओ
      const words = fullText.split(' ');
      const chunkSize = Math.floor(words.length / count);
      for (let i = 0; i < count; i++) {
        const chunk = words.slice(i * chunkSize, (i + 1) * chunkSize).join(' ');
        clips.push({
          id: i + 1,
          title: `Clip ${i + 1} — Best Moment`,
          summary: chunk.substring(0, 100) + '...',
          duration: 45 + Math.floor(Math.random() * 30),
          viralScore: Math.floor(Math.random() * 20) + 80,
          caption: chunk.substring(0, 50)
        });
      }
    }

    res.json({ success: true, clips });

  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`ClipDesi running on port ${PORT}`));
