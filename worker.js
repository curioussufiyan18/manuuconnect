import { knowledge } from "./knowledge.js";

const MODEL = "@cf/meta/llama-3.2-3b-instruct";

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type"
    }
  });
}

function normalize(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function flattenKnowledge(value, source = "", results = []) {
  if (Array.isArray(value)) {
    for (const item of value) {
      flattenKnowledge(item, source, results);
    }

    return results;
  }

  if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      const nextSource = source
        ? `${source}.${key}`
        : key;

      if (
        child &&
        typeof child === "object" &&
        !Array.isArray(child)
      ) {
        results.push({
          source: nextSource,
          content: child
        });

        flattenKnowledge(child, nextSource, results);
      } else {
        results.push({
          source: nextSource,
          content: child
        });
      }
    }

    return results;
  }

  if (value !== null && value !== undefined) {
    results.push({
      source,
      content: value
    });
  }

  return results;
}

const knowledgeIndex = flattenKnowledge(knowledge);

function searchKnowledge(query) {
  const words = normalize(query)
    .split(" ")
    .filter(word => word.length > 2);

  if (!words.length) {
    return [];
  }

  return knowledgeIndex
    .map(item => {
      const text = normalize(
        `${item.source} ${JSON.stringify(item.content)}`
      );

      let score = 0;

      for (const word of words) {
        if (text.includes(word)) {
          score++;
        }
      }

      return {
        ...item,
        score
      };
    })
    .filter(item => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 8);
}

export default {
  async fetch(request, env) {

    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type"
        }
      });
    }

    if (request.method === "GET") {
      return jsonResponse({
        status: "ok",
        service: "MANUUConnect AI",
        model: MODEL
      });
    }

    if (request.method !== "POST") {
      return jsonResponse(
        {
          error: "Method not allowed."
        },
        405
      );
    }

    try {
      const body = await request.json();

      const message = body?.message;

      if (!message || typeof message !== "string") {
        return jsonResponse(
          {
            error: "Please provide a message."
          },
          400
        );
      }

      const cleanMessage = message.trim();

      if (!cleanMessage) {
        return jsonResponse(
          {
            error: "Please provide a message."
          },
          400
        );
      }

      const matches = searchKnowledge(cleanMessage);

      const context =
        matches.length > 0
          ? matches
              .map(item => {
                return `[${item.source}]\n${JSON.stringify(
                  item.content,
                  null,
                  2
                )}`;
              })
              .join("\n\n")
          : "No directly matching information was found in the MANUUConnect knowledge base.";

      const systemPrompt = `
You are MANUUConnect AI.

You are a helpful assistant for the MANUUConnect community.

You have access to MANUUConnect knowledge provided below.

Use the provided knowledge when the user's question is about MANUUConnect.

If the knowledge contains the answer, answer using that information.

If the knowledge does not contain the answer, use your general AI knowledge when appropriate.

Do not claim that MANUUConnect information is present in the knowledge if it is not.

Keep answers clear, natural, and easy to read.

Use proper paragraphs and line breaks.

For lists, use numbered or bullet-style lines.

Normal conversation and greetings are allowed.

User's question:
${cleanMessage}

MANUUConnect knowledge:
${context}
`;

      const result = await env.AI.run(
        MODEL,
        {
          messages: [
            {
              role: "system",
              content: systemPrompt
            },
            {
              role: "user",
              content: cleanMessage
            }
          ],
          max_tokens: 300
        }
      );

      const reply =
        result?.response?.trim() ||
        "I don't have an answer for that right now.";

      return jsonResponse({
        reply
      });

    } catch (error) {

      console.error("MANUUConnect AI error:", error);

      return jsonResponse(
        {
          error: "Something went wrong. Please try again."
        },
        500
      );
    }
  }
};
