export const askPython = async (videoId, question) => {

    console.log("Sending request to Python...");

    return {
        answer: "This answer is coming from the service layer.",
        videoId,
        question
    };

};