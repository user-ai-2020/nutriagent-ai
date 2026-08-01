import { signToken } from "@nutriagent/shared";
import fs from "fs";

process.env.JWT_SECRET = "change-me-in-production-use-secret-manager";

async function run() {
  const sessionId = Math.floor(Date.now() / 1000);
  console.log(`Starting cross-service resume test with sessionId: ${sessionId}`);

  const token = signToken({ userId: 1, email: "user@nutriagent.ai", role: "User" });

  const headers = {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${token}`
  };

  console.log("-> 1. Calling POST /api/chat/message");
  
  // Use native FormData (Node 18+)
  const form = new FormData();
  form.append("message", "I had a pizza and diet coke");
  form.append("sessionId", String(sessionId));
  
  const base64Png = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";
  const dummyImage = new Blob([Buffer.from(base64Png, "base64")], { type: "image/png" });
  form.append("image", dummyImage, "test.png");

  const headersWithFormData = {
    "Authorization": `Bearer ${token}`
  };

  const res1 = await fetch("http://localhost:3000/api/chat/message", {
    method: "POST",
    headers: headersWithFormData,
    body: form as any
  });

  const body1 = await res1.json() as any;
  console.log("Response 1:", body1);

  if (body1.intent !== "clarify_vision") {
    console.warn("Expected clarify_vision intent, got:", body1.intent);
  }

  console.log("-> 2. Calling POST /api/chat/resume");
  const res2 = await fetch("http://localhost:3000/api/chat/resume", {
    method: "POST",
    headers,
    body: JSON.stringify({
      sessionId: sessionId,
      answer: "Just the pizza, diet coke was my friend's. I ate it around 7 PM."
    })
  });

  const body2 = await res2.json();
  console.log("Response 2:", body2);
  
}

run().catch(console.error);
