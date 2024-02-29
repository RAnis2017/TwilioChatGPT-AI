const OpenAI = require("openai");
const dotenv = require("dotenv");
const ContextData = require("./context");
const fs = require('fs');
const request = require("request");
const path = require("path");

dotenv.config(); // Load environment variables

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const elevenLabsTextToSpeech = async (text, fileName) => {
  return new Promise((resolve, reject) => {
  const options = {
    method: 'POST',
    headers: {
      'xi-api-key': process.env.ELEVEN_LABS_API_KEY,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({"pronunciation_dictionary_locators":[],"model_id":"eleven_turbo_v2","text":text,"voice_settings":{"similarity_boost":1,"stability":1}})
  };
  
  request.post('https://api.elevenlabs.io/v1/text-to-speech/'+process.env.ELEVEN_LABS_VOICE_ID+'?optimize_streaming_latency=4&output_format=mp3_22050_32', options)
  .on('response', function(response) {
    console.log(response.statusCode) // 200
    console.log(response.headers['content-type'])
  }) 
  .pipe(fs.createWriteStream(path.join(__dirname, 'assets/'+fileName)))
    .on('close', function() {
      console.log('File written!');
      // Delete the file after 5 minutes
      setTimeout(() => {
        fs.unlink(path.join(__dirname, 'assets/'+fileName), (err) => {
          if (err) {
            console.error(err)
            return
          }
          console.log('File deleted!')
        })
      }, 300000);
      resolve();
    }
  );

  });
     
}

const transcribe = async (fileName) => {

    const response = await openai.audio.transcriptions.create({
        file: fs.createReadStream(fileName),
        model: "whisper-1",
        response_format: "verbose_json",
        timestamp_granularities: ["word"]
      })

    return response;
} 

async function generateResponse(prompt) {
  // Set context for the conversation

  const response = await openai.chat.completions.create({
    messages: [
      // {  // REMOVING THE CONTEXT FOR NOW
      //   role: "system",
      //   content: ContextData[0].context,
      // },
      {
        role: "user",
        content: `

        GIVE ANSWERS IN ONLY 30 WORDS MAX. KEEP IT SHORT AND TO THE POINT.

        ${prompt}
        `,
      },
    ],
    model: "gpt-3.5-turbo",
  });
  console.dir(response, { depth: null });

  // turn the string to speech and return the file name
  const fileName = 'output-'+Date.now()+'.mp3';

  if (process.env.USE_ELEVEN_LABS === "true") {
    console.log("Using Eleven Labs");
    await elevenLabsTextToSpeech(response.choices[0].message.content, fileName);
  }
  return {content: response.choices[0].message.content, fileName};

}

// Example usage:
const prompt = "Please tell me somethings in 1 line about the Apples new product Vision i think?";

// (async () => {
//   const response = await generateResponse(prompt);
//   console.log(response);
// })();

module.exports = {
    generateResponse,
    transcribe
}
