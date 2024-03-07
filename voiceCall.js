require("dotenv").config();
const express = require("express");
const request = require("request");
const fs = require("fs");
const VoiceResponse = require("twilio").twiml.VoiceResponse;
const bodyParser = require("body-parser"); // Or another suitable XML parser
const { generateResponse, transcribe } = require("./streamingChatGPT");
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
const expressWs = require("express-ws")(app);
const port = 1337;
let clients = [];
const WS_CLIENTS = [];


// Parse XML request bodies and JSON
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());
app.use(CORS());

app.use(ROUTE_PREFIX + "assets", express.static("assets"));

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
app.get(ROUTE_PREFIX + "logs", eventsHandler);

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
  phoneNumber = null,
  callSid = null
) {
  const twiml = new VoiceResponse();

  console.log("Waiting for another query...");

  if (INCLUDE_ELEVEN_LABS === "true") {
    console.log("Using Eleven Labs", `${process.env.HOST_ASSETS_URL}/${response.fileName}`);
    // twiml.say(response.message);
    twiml.play(`${process.env.HOST_ASSETS_URL}/${response.fileName}`);
  } else {
    twiml.say(response.message);
  }
  twiml.play(`${process.env.HOST_ASSETS_URL}/continue.mp3`);

  await processVoiceRequest(
    twiml,
    res,
    INCLUDE_WHISPER_AI,
    INCLUDE_ELEVEN_LABS,
    phoneNumber,
    callSid
  );
}

async function processVoiceRequest(
  twiml,
  res,
  INCLUDE_WHISPER_AI = "false",
  INCLUDE_ELEVEN_LABS = "false",
  phoneNumber = null,
  callSid = null
) {
  // Record the entire call

  // Start Streaming
  console.log("Creating stream for call", callSid);
  const stream = await client.calls(callSid).streams.create({
    url: `${process.env.WEBSOCKET_URL}`,
  });

  console.log("Stream created", stream.sid);

  twiml.gather({
    input: "speech", //
    timeout: 2, // 5 seconds to start speaking
    action:
      ROUTE_PREFIX +
      "process-speech?includeElevenLabs=" +
      INCLUDE_ELEVEN_LABS +
      "&includeWhisperAI=" +
      INCLUDE_WHISPER_AI +
      "&phoneNumber=" +
      phoneNumber?.trim() +
      "&streamSid=" +
      stream.sid +
      "&callSid=" +
      callSid, // POST request to this endpoint after gathering
  });

  res.type("text/xml");
  res.send(twiml.toString());
}

app.post(ROUTE_PREFIX + "initiate-call", async (req, res) => {
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
    });
});

// Endpoint for incoming calls
app.post(ROUTE_PREFIX + "voice", async (req, res) => {
  const twiml = new VoiceResponse();
  const call = req.body.CallSid;

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
    await processVoiceRequest(
      twiml,
      res,
      req.query.useWhisperAI,
      req.query.useElevenLabs,
      req.query.phoneNumber,
      call
    );
  } else {
    twiml.play(`${process.env.HOST_ASSETS_URL}/introduction.mp3`);
    await processVoiceRequest(
      twiml,
      res,
      USE_WHISPER_AI,
      USE_ELEVEN_LABS,
      req.query.phoneNumber,
      call
    );
  }
});

// Endpoint to process transcribed speech
app.post(ROUTE_PREFIX + "process-speech", async (req, res) => {
  const transcription = req.body.SpeechResult;

  // stop the stream
  const callSid = req.query.callSid;
  const streamSid = req.query.streamSid;
  console.log("Stopping stream", streamSid, "for call", callSid);
  const stream = await client
    .calls(callSid)
    .streams(streamSid)
    .update({ status: "stopped" });

  // add some delay to ensure the stream is stopped

  await new Promise((resolve) => setTimeout(resolve, 500));

  logToCallFileAndNotify(
    {
      phoneNumber: req.query.phoneNumber,
    },
    "Transcription: " + transcription
  );
  let text = transcription;
  if (req.query.includeWhisperAI === "true") {
    console.log("Using Whisper AI, using the streamed mp3 file");
    const transcribedText = await transcribe("./assets/" + streamSid + ".wav");
    text = transcribedText.text;
  }

  const response = await processAppointmentRequest(text);
  const twiml = new VoiceResponse();

  logToCallFileAndNotify(
    {
      phoneNumber: req.query.phoneNumber,
    },
    "Transcription processed response: " + response.message
  );

  if (response.continue) {
    if (req.query.includeElevenLabs === "true") {
      await waitForAnswer(
        response,
        res,
        false,
        req.query.includeElevenLabs,
        req.query.phoneNumber,
        callSid
      );
    } else {
      await waitForAnswer(
        response,
        res,
        false,
        false,
        req.query.phoneNumber,
        callSid
      );
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
      console.log("Generated response", message);
      
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

// the WebSocket server for the Twilio media stream to connect to.
app.ws(ROUTE_PREFIX+"stream", function (ws, req) {
  // Save stream data to a buffer and then convert it to an WAV file on connection close

  let buffer = Buffer.from("");

  ws.on("message", async function (message) {
    // Check if the message is a JSON message
    if (message[0] !== "{") {
      console.error("No JSON message: Got (", message , ")");
      ws.send("No JSON message: Got (" + message + ")"); // Send a message back to the client
      return; 
    }
    const msg = JSON.parse(message);
    switch (msg.event) {
      case "connected":
        console.info("Twilio media stream connected");
        WS_CLIENTS.push({
          id: msg.streamSid,
          ws,
        });
        break;
      case "start":
        console.info("Twilio media stream started");
        break;
      case "media":
        // Store the media stream data in a text file and o =
        // "payload": "a3242sadfasfa423242... (a base64 encoded string of 8000/mulaw)"
        if (msg.media.payload) {
          buffer = Buffer.concat([
            buffer,
            Buffer.from(msg.media.payload, "base64"),
          ]);
        } else {
          console.error("No media payload: Got (", msg , ")");
        }

        break;
      case "stop":
        console.info("Twilio media stream stopped");
        // Convert the buffer to an WAV file
        fs.writeFileSync(msg.streamSid+".raw", buffer);
        const command = `ffmpeg -f mulaw -ar 8000 -i ${msg.streamSid}.raw ./assets/${msg.streamSid}.wav`;
        console.log("Executing command", command);
        const exec = require("child_process").exec;
        exec(command, (error, stdout, stderr) => {
          if (error) {
            console.error(`Error: ${error}`);
            return;
          }
          console.log(`stdout: ${stdout}`);
          console.error(`stderr: ${stderr}`);
        });
        
        break;
    }
  });
  ws.on("close", async () => {
    console.log("Twilio media stream WebSocket disconnected");
  });
});

app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});
