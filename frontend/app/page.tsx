"use client"
import Image from "next/image";
import { useState } from "react";
import CallLog from "./components/CallLog";

const options = [
  { value: "1", label: "Twilio <> WhisperAI <> ElevenLabs" },
  { value: "2", label: "Twilio <> ElevenLabs" },
  { value: "3", label: "Twilio <> WhisperAI" },
  { value: "4", label: "Twilio Only" },
];

const API_URL = process.env.NEXT_PUBLIC_API_URL;

export default function Home() {
  const [phoneNumber, setPhoneNumber] = useState("");
  const [selectedOption, setSelectedOption] = useState(options[0].value);
  const [callInitiated, setCallInitiated] = useState(false);

  const handleStartCall = async () => {
    try {
      const useWhisperAI = selectedOption === '1' || selectedOption === '3';
      const useElevenLabs = selectedOption === '1' || selectedOption === '2';
      const response = await fetch(API_URL+'/initiate-call', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phoneNumber, useWhisperAI, useElevenLabs }),
      });
  
      if (!response.ok) {
        throw new Error('Call initiation failed');
      }
  
      // Handle successful call initiation (e.g., display a message)
      console.log('Call initiated successfully!'); 
      setCallInitiated(true);
    } catch (error) {
      console.error('Error initiating call:', error);
    }
  };

  return (
    <main className="flex flex-col items-center justify-between p-24 bg-black text-white">
      <div className="container mx-auto p-8">
        <h1 className="text-3xl font-bold mb-6">Start a Call</h1>
        <div className="mb-4">
          <label htmlFor="phone-number" className="block text-white">
            Phone Number:
          </label>
          <input
            type="tel"
            id="phone-number"
            className="w-full px-4 py-2 border rounded-md text-gray-700"
            value={phoneNumber}
            onChange={(e) => setPhoneNumber(e.target.value)}
          />
        </div>
        <div className="mb-6">
          <label htmlFor="option-select" className="block text-white">
            Select Call Options:
          </label>
          <select
            id="option-select"
            className="w-full px-4 py-2 border rounded-md text-gray-700"
            value={selectedOption}
            onChange={(e) => setSelectedOption(e.target.value)}
          >
            {options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
        <button
          className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded"
          onClick={handleStartCall}
        >
          Start Call
        </button>
      </div>

      <div className="container mx-auto p-8"> 
        <h2 className="text-2xl font-semibold mb-4">Call Logs</h2>
        {
          phoneNumber && phoneNumber.length > 6 && callInitiated ? <CallLog phoneNumber={phoneNumber} isWhisperAIEnabled={selectedOption === '1' || selectedOption === '3'} isElevenLabsEnabled={selectedOption === '1' || selectedOption === '2'} />
          : <div className="text-center text-gray-400">No logs to display</div>
        }
      </div>
    </main>
  );
}
