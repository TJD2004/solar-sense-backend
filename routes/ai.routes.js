import { Router } from "express";
import { analyze, chat, schedule } from "../controllers/aiController.js";
import axios from "axios";

const router = Router();

router.post("/analyze", analyze);
router.post("/chat", chat);
router.post("/schedule", schedule);

// GET /api/ai/tts - Proxy Google Translate TTS to bypass browser referrer and CORS policies
router.get("/tts", async (req, res) => {
  try {
    const { text, lang } = req.query;
    if (!text) {
      return res.status(400).send("Text query parameter is required");
    }
    const targetLang = lang || "en";
    const googleTtsUrl = `https://translate.google.com/translate_tts?ie=UTF-8&tl=${targetLang}&client=tw-ob&q=${encodeURIComponent(text)}`;
    
    const response = await axios({
      method: "get",
      url: googleTtsUrl,
      responseType: "stream",
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/100.0.0.0 Safari/537.36"
      }
    });

    res.set("Content-Type", "audio/mpeg");
    response.data.pipe(res);
  } catch (error) {
    console.error("[TTS Proxy] Error proxying Google TTS:", error.message);
    res.status(500).send("Failed to proxy TTS stream");
  }
});

export default router;
