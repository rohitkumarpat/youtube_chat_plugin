import { ensureVideoIsIndexed } from "../services/chat.js";

export const indexVideo = async (req, res) => {
  try {
    const { videoId } = req.body;

    if (!videoId) {
      return res.status(400).json({
        success: false,
        message: "videoId is required.",
      });
    }

    const result = await ensureVideoIsIndexed(videoId);

    return res.status(200).json({
      success: true,
      ...result,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};
