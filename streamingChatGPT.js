const OpenAI = require("openai");
const dotenv = require("dotenv");
const ContextData = require("./context");
const fs = require("fs");
const request = require("request");
const { Stream } = require("stream");
const path = require("path");
const { spawn } = require("child_process"); // Import spawn
const WebSocket = require('ws');

dotenv.config();

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const elevenLabsStreamingTextToSpeech = async (
  text,
  fileNameInitial,
  fileIndex,
  isLast = false
) => {
  const fileName = `part-${fileNameInitial}-${fileIndex}.mp3`;

  const ws = new WebSocket(
    `wss://api.elevenlabs.io/v1/text-to-speech/${process.env.ELEVEN_LABS_VOICE_ID}/stream-input`
  );

  ws.on("open", () => {
      const payload = {
        model_id: "eleven_turbo_v2",
        text: text,
        voice_settings: {
          similarity_boost: 1,
          stability: 1,
        },
        xi_api_key: process.env.ELEVEN_LABS_API_KEY,
      };


      if (isLast) {
        payload.text = "";
      }
      ws.send(JSON.stringify(payload));
  });

  ws.on("message", (data) => {
    const parsedData = JSON.parse(data);
    if (parsedData.audio) {
      console.log("Received audio data");
      console.log(parsedData.audio);

      // send to twilio socket to play the audio

    }
  });

  ws.on("close", () => {

    // No need for the setTimeout/file deletion here,
    // as the file writing is handled directly within the WebSocket

    // Consider calling your mergeAudioFiles function here if needed
  });
};

const transcribe = async (fileName) => {
  const response = await openai.audio.transcriptions.create({
    file: fs.createReadStream(fileName),
    model: "whisper-1",
    response_format: "verbose_json",
    timestamp_granularities: ["word"],
  });

  return response;
};

async function generateResponse(prompt, res) {
  try {
    const responseStream = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        {
          role: "user",
          content: `GIVE ANSWERS IN ONLY 30 WORDS MAX. KEEP IT SHORT AND TO THE POINT.${prompt}`,
        },
      ],
      stream: true,
    });
    // turn the string to speech and return the file name
    const fileName = "output-" + Date.now();
    let fileIndex = 0;
    for await (const part of responseStream) {
      process.stdout.write(part.choices[0]?.delta?.content || "");
      if (part.choices[0]?.delta?.content) {
        fileIndex++;
        elevenLabsStreamingTextToSpeech(
          part.choices[0]?.delta?.content,
          fileName,
          fileIndex,
          part.done
        );
      }
    }

    console.log("Finished generating audio");
    elevenLabsStreamingTextToSpeech("", fileName, fileIndex + 1);
  } catch (error) {
    console.error("Error in generateResponse:", error);
    res.writeHead(500, { "Content-Type": "text/plain" });
    res.write("An error occurred");
    res.end();
  }
}

(async () => {
  const prompt = "Who was the first person to walk on the moon?";
  const res = new Stream();
  await generateResponse(prompt, res);
})();

module.exports = {
  generateResponse,
  transcribe,
};
