import { askPython } from "../services/chat.js";

export const chat = async (req, res) => {

    try {

        const { videoId, question } = req.body;

        console.log("Video ID:", videoId);
        console.log("Question:", question);

       const response = await askPython(videoId, question);

        return res.status(200).json(response);

    } catch (error) {

        return res.status(500).json({
            success: false,
            message: error.message
        });

    }

};