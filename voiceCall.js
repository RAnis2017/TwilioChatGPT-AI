require("dotenv").config();
const express = require("express");

const request = require("request");
const fs = require("fs");
const VoiceResponse = require("twilio").twiml.VoiceResponse;
const bodyParser = require("body-parser"); // Or another suitable XML parser
const { generateResponse, transcribe } = require("./chatgpt");
const USE_ELEVEN_LABS = process.env.USE_ELEVEN_LABS;
const USE_WHISPER_AI = process.env.USE_WHISPER_AI;
const client = require("twilio")(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);
// const { logToFile } = require('./logger');
const SSE = require("express-sse"); // You'll need this module
const sse = new SSE();
const CORS = require("cors");
const ROUTE_PREFIX = "/api/";
const app = express();
const port = 1337;
let clients = [];

// Parse XML request bodies and JSON
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());
app.use(CORS());

app.use(ROUTE_PREFIX+"assets", express.static("assets"));

function eventsHandler(request, response) {
  const headers = {
    "Content-Type": "text/event-stream",
    Connection: "keep-alive",
    "Cache-Control": "no-cache",
  };
  response.writeHead(200, headers);

  const data = `${JSON.stringify({
    timestamp: Date.now(),
    message: "Call initiated, Logs Connection Established!",
  })}`;
  const event = {
    name: "message",
    data,
    id: Date.now(),
  };

  response.write(`event: ${event.name}\n`);
  response.write(`id: ${event.id}\n`);
  response.write(`data: ${event.data}\n\n`);
  const clientId = request.query.clientId;

  const newClient = {
    id: clientId,
    response,
  };

  clients.push(newClient);

  request.on("close", () => {
    console.log(`${clientId} Connection closed`);
    clients = clients.filter((client) => client.id !== clientId);
  });
}

// SSE endpoint to transmit new log events
app.get(ROUTE_PREFIX+"logs", eventsHandler);

// Modify logging
function logToCallFileAndNotify(callData, message) {
  // const filename = `${callData.phoneNumber}_${callData.startTime}.txt`; // Unique filename
  // logToFile(filename, { timestamp: Date.now(),  message });

  if (!callData.phoneNumber) {
    return;
  }

  const logMessageJSON = JSON.stringify({
    timestamp: Date.now(),
    phoneNumber: callData.phoneNumber,
    message,
  });
  const client = clients.find((client) =>
    callData.phoneNumber.includes(client.id.trim())
  );

  if (client) {
    console.log("Client found");
    const event = {
      name: "message",
      data: logMessageJSON,
      id: Date.now(),
    };
    client.response.write(`event: ${event.name}\n`);
    client.response.write(`id: ${event.id}\n`);
    client.response.write(`data: ${event.data}\n\n`);
  } else {
    console.log("Client not found");
  }
}

async function waitForAnswer(
  response,
  res,
  INCLUDE_WHISPER_AI = "false",
  INCLUDE_ELEVEN_LABS = "false",
  phoneNumber = null
) {
  console.log("Waiting for another query...");
  const twiml = new VoiceResponse();
  if (INCLUDE_ELEVEN_LABS === "true") {
    twiml.play(`${process.env.HOST_ASSETS_URL}/${response.fileName}`);
  } else {
    twiml.say(response.message);
  }
  twiml.play(`${process.env.HOST_ASSETS_URL}/continue.mp3`);

  processVoiceRequest(twiml, res, INCLUDE_WHISPER_AI, INCLUDE_ELEVEN_LABS, phoneNumber);
}

function processVoiceRequest(
  twiml,
  res,
  INCLUDE_WHISPER_AI = "false",
  INCLUDE_ELEVEN_LABS = "false",
  phoneNumber = null
) {
  // Record the entire call

  if (INCLUDE_WHISPER_AI === "true") {
    console.log("Using Whisper AI");
    twiml.record({
      recordingStatusCallbackEvent: "completed",
      action:
      ROUTE_PREFIX+"recording-complete?includeElevenLabs=" +
        INCLUDE_ELEVEN_LABS +
        "&phoneNumber=" +
        phoneNumber?.trim(), // POST request to this endpoint after gathering
    });
  } else {
    twiml.gather({
      input: "speech", //
      timeout: 3, // 5 seconds to start speaking
      action:
      ROUTE_PREFIX+"process-speech?includeElevenLabs=" +
        INCLUDE_ELEVEN_LABS +
        "&phoneNumber=" +
        phoneNumber?.trim(), // POST request to this endpoint after gathering
    });
  }

  res.type("text/xml");
  res.send(twiml.toString());
}

app.post(ROUTE_PREFIX+"initiate-call", async (req, res) => {
  setTimeout(() => {
    logToCallFileAndNotify(req.body, "Call initiated");
  }, 2000);
  client.calls
    .create({
      url: `${process.env.HOST_URL}/voice?outbound=true&useWhisperAI=${req.body.useWhisperAI}&useElevenLabs=${req.body.useElevenLabs}&phoneNumber=${req.body.phoneNumber}`,
      to: req.body.phoneNumber,
      from: process.env.TWILIO_PHONE_NUMBER,
    })
    .then((call) => {
      console.log(call.sid);
      res.send("Call initiated");
    });
});

// Endpoint for incoming calls
app.post(ROUTE_PREFIX+"voice", async (req, res) => {
  const twiml = new VoiceResponse();
  setTimeout(() => {
    logToCallFileAndNotify(
      {
        phoneNumber: req.query.phoneNumber,
      },
      "Call answered"
    );
  }, 2000);

  // Record the entire call
  if (req.query.outbound === "true") {
    twiml.play(`${process.env.HOST_ASSETS_URL}/introduction-2.mp3`);
    processVoiceRequest(
      twiml,
      res,
      req.query.useWhisperAI,
      req.query.useElevenLabs,
      req.query.phoneNumber
    );
  } else {
    twiml.play(`${process.env.HOST_ASSETS_URL}/introduction.mp3`);
    processVoiceRequest(
      twiml,
      res,
      USE_WHISPER_AI,
      USE_ELEVEN_LABS,
      req.query.phoneNumber
    );
  }
});

// Endpoint to handle recording completion
app.post(ROUTE_PREFIX+"recording-complete", async (req, res) => {
  // add a delay to ensure the recording is processed
  await new Promise((resolve) => setTimeout(resolve, 3000));

  const twiml = new VoiceResponse();

  const recordingUrl = req.body.RecordingUrl + ".mp3";

  logToCallFileAndNotify(
    {
      phoneNumber: req.query.phoneNumber,
    },
    "Recording completed: " + recordingUrl
  );

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
      response
        .pipe(fs.createWriteStream(filename))
        .on("close", async () => {
          console.log("Recording saved:", filename, recordingUrl);
          try {
            const transcribedText = await transcribe(filename);

            logToCallFileAndNotify(
              {
                phoneNumber: req.query.phoneNumber,
              },
              "Transcription: " + transcribedText.text
            );

            const chatGPTResponse = await processAppointmentRequest(
              transcribedText.text
            );

            console.log('chatGPTResponse', chatGPTResponse);

            logToCallFileAndNotify(
              {
                phoneNumber: req.query.phoneNumber,
              },
              "Transcription processed response: " + chatGPTResponse.message
            );

            if (chatGPTResponse.continue) {
              logToCallFileAndNotify(
                {
                  phoneNumber: req.query.phoneNumber,
                },
                "Waiting for another query..."
              );

              if (req.query.includeElevenLabs === "true") {
                await waitForAnswer(
                  chatGPTResponse,
                  res,
                  true,
                  req.query.includeElevenLabs,
                  req.query.phoneNumber
                );
              } else {
                await waitForAnswer(chatGPTResponse, res, true, false, req.query.phoneNumber);
              }
            } else {
              logToCallFileAndNotify(
                {
                  phoneNumber: req.query.phoneNumber,
                },
                "Response: " + chatGPTResponse.message
              );

              if (USE_ELEVEN_LABS === "true") {
                twiml.play(
                  `${process.env.HOST_ASSETS_URL}/${chatGPTResponse.fileName}`
                );
              } else {
                twiml.say(chatGPTResponse.message);
              }
              res.type("text/xml");
              res.send(twiml.toString());
            }
          } catch (error) {
            logToCallFileAndNotify(
              {
                phoneNumber: req.query.phoneNumber,
              },
              "Error: " + error
            );

            twiml.play(`${process.env.HOST_ASSETS_URL}/error.mp3`);
            res.type("text/xml");
            res.send("<Response/>"); // Send an empty response to end the Twilio interaction
          }
        })
        .on("error", (err) => {
          logToCallFileAndNotify(
            {
              phoneNumber: req.query.phoneNumber,
            },
            "Error: " + err
          );

          console.error("Error downloading file", err);
          twiml.play(`${process.env.HOST_ASSETS_URL}/error.mp3`);
          res.type("text/xml");
          res.send("<Response/>"); // Send an empty response to end the Twilio interaction
        });
    });
});

// Endpoint to process transcribed speech
app.post(ROUTE_PREFIX+"process-speech", async (req, res) => {
  const transcription = req.body.SpeechResult;
  logToCallFileAndNotify(
    {
      phoneNumber: req.query.phoneNumber,
    },
    "Transcription: " + transcription
  );
  const response = await processAppointmentRequest(transcription);
  const twiml = new VoiceResponse();

  logToCallFileAndNotify(
    {
      phoneNumber: req.query.phoneNumber,
    },
    "Transcription processed response: " + response.message
  );

  if (response.continue) {
    if (req.query.includeElevenLabs === "true") {
      await waitForAnswer(response, res, false, req.query.includeElevenLabs, req.query.phoneNumber);
    } else {
      await waitForAnswer(response, res, false, false, req.query.phoneNumber);
    }
  } else {
    twiml.play(`${process.env.HOST_ASSETS_URL}/${response.fileName}`);
    res.type("text/xml");
    res.send(twiml.toString());
  }
});

// Basic intent recognition - Expand and Refine!
async function processAppointmentRequest(text) {
  if (text.toLowerCase().includes("bye") || text.trim().length === 0) {
    return {
      message: "Bye",
      fileName: "bye.mp3",
      continue: false,
    };
  } else {
    try {
      let message = await generateResponse(text);
      return {
        message: message.content,
        fileName: message.fileName,
        continue: true,
      };
    } catch (error) {
      return { message: "Sorry, I don't understand.", continue: false };
    }
  }
}

app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});
