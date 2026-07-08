import { askVideoQuestion } from "../services/chat.js";

export const chat = async (req, res) => {
  try {
    const { videoId, question, pageContext } = req.body;

    if (!videoId || !question) {
      return res.status(400).json({
        success: false,
        message: "videoId and question are required.",
      });
    }

    const response = await askVideoQuestion(videoId, question, pageContext || {});

    return res.status(200).json(response);
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};
