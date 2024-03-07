const OpenAI = require("openai");
const dotenv = require("dotenv");
const ContextData = require("./context");
const fs = require("fs");
const request = require("request");
const { Stream } = require("stream");
const path = require("path");
const { spawn } = require("child_process"); // Import spawn
const WebSocket = require("ws");

dotenv.config();

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const elevenLabsStreamingTextToSpeech = async (ws, text, isLast = false) => {
  const payload = {
    model_id: "eleven_turbo_v2",
    text: text,
    voice_settings: {
      stability: 0.8,
      similarity_boost: 0.8,
    },
    generation_config: {
      chunk_length_schedule: [120, 160, 250, 290],
    },
    xi_api_key: process.env.ELEVEN_LABS_API_KEY,
  };
  ws.send(JSON.stringify(payload));

  if (isLast) {
    ws.send(JSON.stringify({ ...payload, text: "" })); // Send an empty string to signal the end of the input
  }
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

async function generateResponse(prompt, twilioWS = null, streamSid = null) {
  return new Promise(async (resolve, reject) => {
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
      const filePath = path.join(__dirname, "assets", fileName);
      let fileIndex = 0;

      const ws = new WebSocket(
        `wss://api.elevenlabs.io/v1/text-to-speech/${process.env.ELEVEN_LABS_VOICE_ID}/stream-input`
      );
      let response = "";
      ws.on("open", async () => {
        for await (const part of responseStream) {
          if (part.choices[0]?.delta?.content) {
            // console.log("Part ("+fileIndex+"):",part.choices[0]?.delta?.content || "");

            response += part.choices[0]?.delta?.content;

            fileIndex++;
            elevenLabsStreamingTextToSpeech(
              ws,
              part.choices[0]?.delta?.content,
              part.done
            );
          }
        }
        elevenLabsStreamingTextToSpeech(ws, "", true);
      });

      const fileBuffer = [];

      ws.on("message", (data) => {
        const dataString = data.toString();
        if (dataString.includes("audio")) {
          const audioData = JSON.parse(dataString);
          if (audioData.audio) {
            // const audioBuffer = Buffer.from(audioData.audio, "base64");
            // fileBuffer.push(audioBuffer);
            // console.log("Received audio chunk", fileBuffer);
            if (twilioWS && streamSid) {
              twilioWS.send(
                JSON.stringify({
                  event: "media",
                  streamSid: streamSid,
                  media: {
                    payload: audioData.audio,
                  },
                })
              );

              twilioWS.send(
                JSON.stringify({
                  event: "mark",
                  streamSid: streamSid,
                  mark: {
                    name: "end",
                  },
                })
              );
            } else {
              const audioBuffer = Buffer.from(audioData.audio, "base64");
              fileBuffer.push(audioBuffer);
            }
          }
        }
      });

      ws.on("close", () => {
        // console.log("Connection closed");
        // console.log(JSON.stringify(fileBuffer));

        if (!twilioWS && !streamSid) {
          fs.writeFileSync(filePath + ".mp3", Buffer.concat(fileBuffer));
          console.log("Finished writing file", filePath);
        }
        resolve({
          content: response,
          fileName: fileName + ".mp3",
        });
      });

    } catch (error) {
      console.error("Error in generateResponse:", error);
      reject(error);
    }
  });
}

// (async () => {
//   const prompt = "Who was the first person to walk on the moon?";
//   const res = new Stream();
//   await generateResponse(prompt, res);
// })();

module.exports = {
  generateResponse,
  transcribe,
};
