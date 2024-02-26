import { useState, useEffect } from 'react';

function CallLog() {
  const [callLogs, setCallLogs] = useState([]);

  // ... Logic to fetch and update call logs (more on this later)

  return (
    <div className="bg-slate-700 rounded-lg p-6"> 
      <ul> 
        {callLogs.map((log : any) => (
          <li key={log.id} className="border-b border-slate-600 py-2">
            <div>Phone Number: {log.phoneNumber}</div>
            <div>Options: {log.options}</div> 
            <div>Timestamp: {log.timestamp}</div> 
            <div>Message: {log.message}</div>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default CallLog;