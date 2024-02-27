import { useState } from "react";

function Login({
  setIsVerified,
}: {
  setIsVerified: (isVerified: boolean) => void;
}) {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');

    const handleLogin = () => {
        if (username === process.env.NEXT_PUBLIC_USERNAME && password === process.env.NEXT_PUBLIC_PASSWORD) {
            setIsVerified(true);
        }
    }

    const handleUsernameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setUsername(e.target.value);
    }

    const handlePasswordChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setPassword(e.target.value);
    }
  return (
    <div className="bg-slate-700 rounded-lg p-6">
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-xl font-bold mb-4">Twilio AI Chatbot - Login</h1>
      </div>
      <div className="mb-4">
        <label htmlFor="username" className="block text-white">
          Username:
        </label>
        <input
          type="text"
          id="username"
          className="w-full px-4 py-2 border rounded-md text-gray-700"
            onChange={handleUsernameChange}
        />

        <label htmlFor="password" className="block text-white">
          Password:
        </label>
        <input
          type="password"
          id="password"
          className="w-full px-4 py-2 border rounded-md text-gray-700"
            onChange={handlePasswordChange}
        />

        <button
          className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded disabled:opacity-50 mt-2 float-end"
          onClick={() => handleLogin()}
        >
          Login
        </button>
      </div>
    </div>
  );
}

export default Login;
