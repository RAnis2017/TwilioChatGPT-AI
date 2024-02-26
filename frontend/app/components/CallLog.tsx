import { useState, useEffect } from "react";

function useFetchEventSource(url: any, options = {}) {
  const [data, setData]: any = useState([]);
  const [error, setError]: any = useState(null);

  const processEvent = (event: any) => {
    try {
      const parsedData = JSON.parse(event.data);
      setData((prevData:any) => [...prevData, parsedData]);
    } catch (error) {
      setError(error);
    }
  };

  useEffect(() => {
    const eventSource = new EventSource(url, options);

    eventSource.onmessage = (event) => {
      setTimeout(() => processEvent(event), 1000);
    };

    eventSource.onerror = (event: any) => {
      if (event.eventPhase === EventSource.CLOSED) {
        console.log("Connection was closed");
      } else {
        setError(new Error("EventSource failed"));
      }
    };

    return () => {
      eventSource.close(); // Cleanup: Close the connection
    };
  }, []);

  return { data, error };
}

const API_URL = process.env.NEXT_PUBLIC_API_URL;

function CallLog({ phoneNumber, isWhisperAIEnabled, isElevenLabsEnabled }: { phoneNumber: string, isWhisperAIEnabled: boolean, isElevenLabsEnabled: boolean }) {
  const { data, error } = useFetchEventSource(
    `${API_URL}/logs?clientId=${phoneNumber}`
  );

  if (error) {
    console.error("Error fetching events:", error);
    return <div>Error fetching events: {error.message}</div>;
  } else if (!data || data.length === 0) {
    return <div>Loading events...</div>;
  } else {
    // Process and display the received data
    return (
      <div className="bg-slate-700 rounded-lg p-6">
        <ul>
          {data.map((logEntry: any) => (
            <li
              key={logEntry.timestamp}
              className="border-b border-slate-600 py-2"
            >
              <div className="text-green-400 font-bold">Phone Number: {logEntry.phoneNumber || phoneNumber}</div>
              <div>WhisperAI Enabled?: {isWhisperAIEnabled}</div>
              <div>ElevenLabs Enabled?: {isElevenLabsEnabled}</div>
              <div>Timestamp: {new Date(logEntry.timestamp).toString()}</div>
              <div className="font-bold bg-slate-400 p-6 mt-2 rounded-lg">Message: {logEntry.message}</div>
            </li>
          ))}
        </ul>
      </div>
    );
  }
}

export default CallLog;
