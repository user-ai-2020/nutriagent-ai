import { PrismaClient } from "@nutriagent/db";
import { signToken } from "@nutriagent/shared";

const prisma = new PrismaClient();

async function run() {
  const user = await prisma.user.findFirst({ where: { email: "user@nutriagent.ai" } });
  if (!user) throw new Error("No user found");
  
  const token = signToken({ userId: user.userId, email: user.email, role: "User" });

  // Dashboard sum for the week
  const dateKey = new Date().toISOString().split("T")[0];
  const dashRes = await fetch(`http://127.0.0.1:3000/api/dashboard?period=week&date=${dateKey}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const dashData: any = await dashRes.json();
  const dashCalories = dashData.totals?.calories ?? 0;
  
  const sessionRes = await fetch(`http://127.0.0.1:3000/api/chat/session`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` }
  });
  const sessionData: any = await sessionRes.json();

  // Text2SQL sum for the week
  const t2sRes = await fetch(`http://127.0.0.1:3000/api/chat/message`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ 
      message: "What is the total sum of calories that I ate between 2026-07-25 and 2026-08-01?",
      sessionId: sessionData.sessionId
    })
  });
  const t2sData: any = await t2sRes.json();
  
  console.log("Text2SQL Raw:", t2sData);
  console.log("Dashboard Calories:", dashCalories);
  console.log("Text2SQL Reply:", t2sData.reply);
}

run().catch(console.error);
