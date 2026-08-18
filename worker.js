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

/*
  Turn the knowledge into searchable records.
*/
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

const knowledgeIndex = flattenKnowledge(knowledge);

/*
  Better knowledge retrieval.

  Returns:
  {
    matches: [...],
    bestScore: number
  }
*/
function searchKnowledge(query) {
  const normalizedQuery = normalize(query);

  const words = normalizedQuery
    .split(" ")
    .filter((word) => word.length > 2);

  if (!words.length) {
    return {
      matches: [],
      bestScore: 0
    };
  }

  const ranked = knowledgeIndex
    .map((item) => {
      const text = normalize(
        `${item.source} ${JSON.stringify(item.content)}`
      );

      let score = 0;
      let matchedWords = 0;

      /*
        Word matching
      */
      for (const word of words) {
        if (text.includes(word)) {
          score += 2;
          matchedWords++;
        }
      }

      /*
        Exact phrase match
      */
      if (
        normalizedQuery.length >= 6 &&
        text.includes(normalizedQuery)
      ) {
        score += 10;
      }

      /*
        Coverage bonus
      */
      const coverage =
        words.length > 0
          ? matchedWords / words.length
          : 0;

      score += coverage * 6;

      /*
        Source bonuses
      */
      if (item.source.includes("coreteam")) {
        score += 1;
      }

      if (item.source.includes("events")) {
        score += 1;
      }

      if (item.source.includes("mentors")) {
        score += 1;
      }

      if (item.source.includes("faq")) {
        score += 1;
      }

      return {
        ...item,
        score
      };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score);

  return {
    matches: ranked.slice(0, 5),
    bestScore: ranked[0]?.score || 0
  };
}

/*
  Search Serper.
*/
async function searchSerper(query, env, site) {
  if (!env.SERPER_API_KEY) {
    return [];
  }

  const searchQuery = site
    ? `site:${site} ${query}`
    : query;

  try {
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

    return (data.organic || []).map((item) => ({
      title: item.title || "",
      link: item.link || "",
      snippet: item.snippet || ""
    }));
  } catch (error) {
    console.error(
      "Serper request failed:",
      error
    );

    return [];
  }
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

/*
  Simple greetings should not trigger web search.
*/
function isGreeting(message) {
  const q = normalize(message);

  return [
    "hi",
    "hello",
    "hey",
    "hii",
    "hiii",
    "heyy",
    "yo",
    "sup",
    "wassup",
    "what is up",
    "whats up",
    "good morning",
    "good afternoon",
    "good evening",
    "thanks",
    "thank you",
    "ok",
    "okay"
  ].includes(q);
}

function greetingResponse(message) {
  const q = normalize(message);

  if (
    q === "thanks" ||
    q === "thank you"
  ) {
    return "You're welcome.";
  }

  return "Hi! 👋 How can I help you with MANUUConnect?";
}

export default {
  async fetch(request, env) {

    /*
      CORS
    */
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods":
            "GET, POST, OPTIONS",
          "Access-Control-Allow-Headers":
            "Content-Type"
        }
      });
    }

    /*
      Health check
    */
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
      /*
        Read input
      */
      const body = await request.json();

      const message = body?.message;

      if (
        !message ||
        typeof message !== "string"
      ) {
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
        Greetings
      */
      if (isGreeting(cleanMessage)) {
        return jsonResponse({
          reply: greetingResponse(cleanMessage),
          source: null
        });
      }

      /*
        1. Search local MANUUConnect knowledge
      */
      const {
        matches,
        bestScore
      } = searchKnowledge(cleanMessage);

      /*
        Minimum confidence needed to trust
        local knowledge.
      */
      const KNOWLEDGE_THRESHOLD = 7;

      const strongKnowledgeMatch =
        bestScore >= KNOWLEDGE_THRESHOLD;

      let knowledgeContext = "";

      if (strongKnowledgeMatch) {
        knowledgeContext = matches
          .map((item) => {
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
        2. If local knowledge is weak,
           use trusted-source fallback.
      */
      let webContext = "";
      let webSource = "";

      if (!strongKnowledgeMatch) {

        /*
          First: manuuconnect.in
        */
        const websiteResults =
          await searchSerper(
            cleanMessage,
            env,
            "manuuconnect.in"
          );

        if (websiteResults.length > 0) {
          webContext = formatWebResults(
            websiteResults,
            "manuuconnect.in"
          );

          webSource = "manuuconnect.in";
        } else {

          /*
            Second: LinkedIn
          */
          const linkedinResults =
            await searchSerper(
              `MANUUConnect ${cleanMessage}`,
              env,
              "linkedin.com"
            );

          if (linkedinResults.length > 0) {
            webContext = formatWebResults(
              linkedinResults,
              "LinkedIn"
            );

            webSource = "LinkedIn";
          }
        }
      }

      /*
        3. Build final context.
      */
      let context = "";

      let source = null;

      if (strongKnowledgeMatch) {
        context = knowledgeContext;
        source = "MANUUConnect knowledge";
      } else if (webContext) {
        context = `
Trusted external information:

${webContext}
`;
        source = webSource;
      } else {
        context = `
No matching MANUUConnect information was
found in the local knowledge or trusted sources.
`;
      }

      /*
        4. AI
      */
      const systemPrompt = `
You are MANUUConnect AI for manuuconnect.in.

You help with:
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

Use the provided information carefully.

If local MANUUConnect knowledge contains the answer,
use it as the primary source.

If trusted external information is provided,
use it only as a secondary source.

Never invent MANUUConnect facts.

If the available information does not contain
the answer, say:

"I don't have that information yet."

Normal greetings are allowed.

Keep the answer short.

Use short paragraphs.

Leave a blank line between separate points.

For multiple items, use bullet points or numbered lines.

Use labels such as:
Date:
Type:
Participants:

Do not repeat the user's question.

Do not add unnecessary information.

USER QUESTION:
${cleanMessage}

AVAILABLE INFORMATION:
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
        reply,
        source
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
