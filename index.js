require("dotenv").config();
const express = require("express");
const VoiceResponse = require("twilio").twiml.VoiceResponse;
const { SpeechClient } = require("@google-cloud/speech");
const bodyParser = require("body-parser"); // Or another suitable XML parser
const { generateResponse } = require("./chatgpt");

const app = express();
const port = 1337;

// Parse XML request bodies
app.use(bodyParser.urlencoded({ extended: false }));
// Your Twilio credentials
const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const client = require("twilio")(accountSid, authToken);
const speechTimeout = 3;

// Instantiate a Google Speech-to-Text client
const speechClient = new SpeechClient();

async function waitForAnswer(response, res) {
  console.log("Waiting for another query...");
  const twiml = new VoiceResponse();
  const gather = twiml.gather({
    input: "speech",
    timeout: speechTimeout, // 5 seconds to start speaking
    action: "/process-speech", // POST request to this endpoint after gathering
  });
  gather.say(response.message);
  gather.say("If you have any other questions, you can go ahead and ask.");

  res.type("text/xml");
  res.send(twiml.toString());
}

// Endpoint for incoming calls
app.post("/voice", async (req, res) => {
  const twiml = new VoiceResponse();

  const gather = twiml.gather({
    input: "speech", //
    timeout: speechTimeout, // 5 seconds to start speaking
    action: "/process-speech", // POST request to this endpoint after gathering
  });
  gather.say(
    "Hello, thank you for calling the information center. How can I help you?"
  );

  res.type("text/xml");
  res.send(twiml.toString());
});

// Endpoint to process transcribed speech
app.post("/process-speech", async (req, res) => {
  console.log(req.body);
  const transcription = req.body.SpeechResult;
  const response = await processAppointmentRequest(transcription);
  const twiml = new VoiceResponse();
  console.log("Transcription:", transcription, response);

  if (response.continue) {
    await waitForAnswer(response, res);
  } else {
    twiml.say(response.message);
    res.type("text/xml");
    res.send(twiml.toString());
  }
});

// Basic intent recognition - Expand and Refine!
async function processAppointmentRequest(text) {
  if (text.includes("bye") || text.includes("end call")) {
    return {
      message:
        "Great! Hopefully the information center helped find you what you were looking for. Feel free to call back again for any further queries",
      continue: false,
    };
  } else {
    try {
      let message = await generateResponse(text);
      return { message, continue: true };
    } catch (error) {
      return { message: "Sorry, I don't understand.", continue: false };
    }
  }
}

app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});
