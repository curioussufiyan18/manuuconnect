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
      if (
        item &&
        typeof item === "object" &&
        !Array.isArray(item)
      ) {
        results.push({
          source,
          content: item
        });
      } else {
        flattenKnowledge(item, source, results);
      }
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

        flattenKnowledge(
          child,
          nextSource,
          results
        );
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

const knowledgeIndex =
  flattenKnowledge(knowledge);

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

async function searchSerper(query, env, site) {
  if (!env.SERPER_API_KEY) {
    return [];
  }

  const searchQuery = site
    ? `site:${site} ${query}`
    : query;

  const response = await fetch(
    "https://google.serper.dev/search",
    {
      method: "POST",
      headers: {
        "X-API-KEY": env.SERPER_API_KEY,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        q: searchQuery,
        gl: "in",
        hl: "en",
        num: 5
      })
    }
  );

  if (!response.ok) {
    console.error(
      "Serper error:",
      response.status,
      await response.text()
    );

    return [];
  }

  const data = await response.json();

  return (data.organic || []).map(item => ({
    title: item.title || "",
    link: item.link || "",
    snippet: item.snippet || ""
  }));
}

function formatWebResults(results, sourceName) {
  if (!results.length) {
    return "";
  }

  return results
    .map(
      (item, index) =>
        `[${sourceName} ${index + 1}]
Title: ${item.title}
URL: ${item.link}
Snippet: ${item.snippet}`
    )
    .join("\n\n");
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

      if (cleanMessage.length > 1000) {
        return jsonResponse(
          {
            error: "Message is too long."
          },
          400
        );
      }

      /*
        1. Search your own MANUUConnect knowledge first.
      */

      const matches =
        searchKnowledge(cleanMessage);

      let knowledgeContext = "";

      if (matches.length > 0) {
        knowledgeContext = matches
          .map(item => {
            return `[MANUUConnect Knowledge]
Source: ${item.source}

${JSON.stringify(
  item.content,
  null,
  2
)}`;
          })
          .join("\n\n");
      }

      /*
        2. If local knowledge has nothing,
           search manuuconnect.in.
      */

      let webContext = "";
      let webSource = "";

      if (matches.length === 0) {
        const websiteResults =
          await searchSerper(
            cleanMessage,
            env,
            "manuuconnect.in"
          );

        if (websiteResults.length > 0) {
          webContext =
            formatWebResults(
              websiteResults,
              "manuuconnect.in"
            );

          webSource = "manuuconnect.in";
        } else {
          /*
            3. If website search has nothing,
               search LinkedIn.
          */

          const linkedinResults =
            await searchSerper(
              `MANUUConnect ${cleanMessage}`,
              env,
              "linkedin.com"
            );

          if (linkedinResults.length > 0) {
            webContext =
              formatWebResults(
                linkedinResults,
                "LinkedIn"
              );

            webSource = "LinkedIn";
          }
        }
      }

      /*
        4. Build AI context.
      */

      let context = "";

      if (knowledgeContext) {
        context = knowledgeContext;
      } else if (webContext) {
        context = `
Trusted external source:

${webContext}
`;
      } else {
        context = `
No matching information was found in the
MANUUConnect knowledge base or trusted sources.
`;
      }

      /*
        5. AI
      */

      const systemPrompt = `
You are MANUUConnect AI for manuuconnect.in.

Your job is to answer questions about:
- MANUUConnect
- its team and members
- projects
- events
- achievements
- mentors and alumni
- activities
- opportunities
- website information
- student learning and career guidance

Information priority:

1. MANUUConnect knowledge
2. manuuconnect.in
3. MANUUConnect LinkedIn

Use the provided information.

Never invent MANUUConnect facts.

If the provided information does not contain the answer, say:
"I don't have that information yet."

Normal conversation and greetings are allowed.

Keep answers short, clear, and easy to understand.

Use proper line breaks.

For multiple items, use bullet points or numbered lines.

Do not repeat the user's question.

Do not add unnecessary information.

USER QUESTION:
${cleanMessage}

INFORMATION:
${context}
`;

      const result =
        await env.AI.run(
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
        reply,
        source:
          matches.length > 0
            ? "MANUUConnect knowledge"
            : webSource || null
      });

    } catch (error) {

      console.error(
        "MANUUConnect AI error:",
        error
      );

      return jsonResponse(
        {
          error:
            "Something went wrong. Please try again."
        },
        500
      );
    }
  }
};
