import { GoogleGenAI } from "@google/genai";
import { type ChatMessage } from "./types";

export type GoogleClientOptions = {
  apiKey: string;
};

export function createGoogleClient(opts: GoogleClientOptions) {
  const ai = new GoogleGenAI({ apiKey: opts.apiKey });
  return ai;
}

export async function generateGoogleText(
  ai: ReturnType<typeof createGoogleClient>,
  model: string,
  history: ChatMessage[],
  userText: string
): Promise<string> {
  // SDK README 支持 contents 直接传字符串；为兼容历史可串接文本
  // 将历史压缩为简单转写：User/Assistant 交替文本。
  const transcript = history
    .map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.text}`)
    .join("\n");
  const prompt = transcript
    ? `${transcript}\nUser: ${userText}\nAssistant:`
    : userText;

  const res = await ai.models.generateContent({
    model,
    contents: prompt,
  });
  return res.text ?? "";
}


