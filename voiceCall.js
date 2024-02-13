require("dotenv").config();
const express = require("express");

const request = require("request");
const fs = require("fs");
const VoiceResponse = require("twilio").twiml.VoiceResponse;
const bodyParser = require("body-parser"); // Or another suitable XML parser
const { generateResponse, transcribe } = require("./chatgpt");

const app = express();
const port = 1337;

// Parse XML request bodies
app.use(bodyParser.urlencoded({ extended: false }));
app.use('/assets', express.static('assets'))

async function waitForAnswer(response, res) {
  console.log("Waiting for another query...");
  const twiml = new VoiceResponse();
  twiml.play(`${process.env.HOST_ASSETS_URL}/${response.fileName}`);
  twiml.play(`${process.env.HOST_ASSETS_URL}/continue.mp3`);

  // Record the entire call
  twiml.record({
    action: "/recording-complete", // Endpoint to handle  when recording is done
    recordingStatusCallbackEvent: "completed",
  });

  res.type("text/xml");
  res.send(twiml.toString());
}

// Endpoint for incoming calls
app.post("/voice", async (req, res) => {
  const twiml = new VoiceResponse();
  twiml.play(`${process.env.HOST_ASSETS_URL}/introduction.mp3`);

  // Record the entire call
  twiml.record({
    recordingStatusCallbackEvent: "completed",
    action: "/recording-complete", // POST request to this endpoint after gathering
  });

  res.type("text/xml");
  res.send(twiml.toString());
});

// Endpoint to handle recording completion
app.post("/recording-complete", async (req, res) => {

  // add a delay to ensure the recording is processed
  await new Promise((resolve) => setTimeout(resolve, 3000));

  const twiml = new VoiceResponse();

  const recordingUrl = req.body.RecordingUrl + ".mp3";

  // Download the recording (directly as MP3)
  request
    .get(recordingUrl, {
      headers: {
        Accept: "audio/mpeg",
      },
    })
    .on("response", async (response) => {
      // Check on response before piping
      const contentType = response.headers["content-type"];
      const filename = `${Date.now()}.${contentType.split("/")[1]}`;

      // File checks passed -  Proceed with download and further processing
      response.pipe(fs.createWriteStream(filename)).on("close", async () => {
        console.log("Recording saved:", filename, recordingUrl);
        try {
          const transcribedText = await transcribe(filename);
          console.log(transcribedText.text);

          const chatGPTResponse = await processAppointmentRequest(
            transcribedText.text
          );
          if (chatGPTResponse.continue) {
            await waitForAnswer(chatGPTResponse, res);
          } else {
            twiml.say(chatGPTResponse.message);
            res.type("text/xml");
            res.send(twiml.toString());
          }
        } catch (error) {
          console.log("error", error);
          twiml.play(`${process.env.HOST_ASSETS_URL}/error.mp3`);
          res.type("text/xml");
          res.send("<Response/>"); // Send an empty response to end the Twilio interaction
        }
      });
    });
});

// Endpoint to process transcribed speech
app.post("/process-speech", async (req, res) => {
  const transcription = req.body.SpeechResult;
  const response = await processAppointmentRequest(transcription);
  const twiml = new VoiceResponse();
  console.log("Transcription:", transcription, response);

  if (response.continue) {
    await waitForAnswer(response, res);
  } else {
    twiml.play(`${process.env.HOST_ASSETS_URL}/${response.fileName}`);
    res.type("text/xml");
    res.send(twiml.toString());
  }
});

// Basic intent recognition - Expand and Refine!
async function processAppointmentRequest(text) {
  if (text.toLowerCase().includes("bye") || text.toLowerCase().includes("no")) {
    return {
      message:
        "Bye",
      fileName: "bye.mp3",
      continue: false,
    };
  } else {
    try {
      let message = await generateResponse(text);
      return { message: message.content, fileName: message.fileName, continue: true };
    } catch (error) {
      return { message: "Sorry, I don't understand.", continue: false };
    }
  }
}

app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});
