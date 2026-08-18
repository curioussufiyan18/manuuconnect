import { knowledge } from "./knowledge.js";

const MODEL = "@cf/meta/llama-3.2-3b-instruct";
const EMBEDDING_MODEL = "@cf/baai/bge-base-en-v1.5";

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
  Build the same searchable text used when
  the knowledge was indexed.
*/
function buildKnowledgeRecords() {
  const records = [];

  for (const [category, data] of Object.entries(knowledge)) {
    if (!data || typeof data !== "object") {
      continue;
    }

    const content = data.content;
    const categoryType = data.type || category;
    const categoryTitle = data.title || category;
    const keywords = Array.isArray(data.keywords)
      ? data.keywords.join(", ")
      : "";

    if (Array.isArray(content)) {
      content.forEach((item, index) => {
        if (!item || typeof item !== "object") {
          return;
        }

        const id =
          item.id || `${category}-${index + 1}`;

        const title =
          item.title ||
          item.name ||
          item.question ||
          categoryTitle;

        records.push({
          id,
          category,
          type: item.type || categoryType,
          title,
          text: [
            `Category: ${category}`,
            `Type: ${item.type || categoryType}`,
            `Title: ${title}`,
            `Keywords: ${keywords}`,
            JSON.stringify(item, null, 2)
          ].join("\n")
        });
      });
    } else {
      records.push({
        id: data.id || category,
        category,
        type: categoryType,
        title: categoryTitle,
        text: [
          `Category: ${category}`,
          `Type: ${categoryType}`,
          `Title: ${categoryTitle}`,
          `Keywords: ${keywords}`,
          JSON.stringify(content, null, 2)
        ].join("\n")
      });
    }
  }

  return records;
}

const localKnowledge = buildKnowledgeRecords();

/*
  Find the local record text for a Vectorize ID.
  This gives us clean source material when metadata
  is incomplete.
*/
const knowledgeById = new Map(
  localKnowledge.map(item => [item.id, item])
);

async function searchVectorize(query, env) {
  try {
    const embedding = await env.AI.run(
      EMBEDDING_MODEL,
      {
        text: [query]
      }
    );

    const queryVector = embedding?.data?.[0];

    if (!queryVector) {
      return [];
    }

    const result = await env.VECTORIZE.query(
      queryVector,
      {
        topK: 25,
        returnMetadata: "all"
      }
    );

    return result?.matches || [];
  } catch (error) {
    console.error("Vectorize search failed:", error);
    return [];
  }
}

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
        response.status
      );
      return [];
    }

    const data = await response.json();

    return (data.organic || []).map(item => ({
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

function buildVectorContext(matches) {
  if (!matches.length) {
    return "";
  }

  return matches
    .map((match, index) => {
      const metadata = match.metadata || {};
      const local = knowledgeById.get(match.id);

      return `
[Knowledge Result ${index + 1}]
Score: ${match.score ?? ""}
Category: ${metadata.category || local?.category || ""}
Type: ${metadata.type || local?.type || ""}
Title: ${metadata.title || local?.title || ""}

${metadata.text || local?.text || ""}
`;
    })
    .join("\n");
}

function buildWebContext(results, source) {
  if (!results.length) {
    return "";
  }

  return results
    .map(
      (item, index) => `
[${source} Result ${index + 1}]
Title: ${item.title}
URL: ${item.link}
Snippet: ${item.snippet}
`
    )
    .join("\n");
}

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

  if (q === "thanks" || q === "thank you") {
    return "You're welcome.";
  }

  return "Hi! 👋 How can I help you with MANUUConnect?";
}

export default {
  async fetch(request, env) {
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

    if (request.method === "GET") {
      return jsonResponse({
        status: "ok",
        service: "MANUUConnect AI",
        model: MODEL,
        embeddingModel: EMBEDDING_MODEL
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

      if (cleanMessage.length > 2000) {
        return jsonResponse(
          {
            error: "Message is too long."
          },
          400
        );
      }

      /*
        Normal greetings stay fast.
      */
      if (isGreeting(cleanMessage)) {
        return jsonResponse({
          reply: greetingResponse(cleanMessage),
          source: null
        });
      }

      /*
        1. Search MANUUConnect knowledge
           through Vectorize.
      */
      const vectorMatches =
        await searchVectorize(
          cleanMessage,
          env
        );

      const bestScore =
        vectorMatches[0]?.score || 0;

      /*
        We do not require an exact score here.
        We use the retrieved records as context
        when Vectorize returns something useful.
      */
      const usefulMatches =
        vectorMatches.filter(
          match => (match.score ?? 0) >= 0.25
        );

      let context = "";
      let source = null;

      if (usefulMatches.length) {
        context = buildVectorContext(
          usefulMatches
        );

        source = "MANUUConnect knowledge";
      }

      /*
        2. If local knowledge did not give us
           useful context, search the official website.
      */
      if (!context) {
        const websiteResults =
          await searchSerper(
            cleanMessage,
            env,
            "manuuconnect.in"
          );

        if (websiteResults.length) {
          context = buildWebContext(
            websiteResults,
            "manuuconnect.in"
          );

          source = "manuuconnect.in";
        }
      }

      /*
        3. If the official website gives nothing,
           search MANUUConnect-related LinkedIn results.
      */
      if (!context) {
        const linkedinResults =
          await searchSerper(
            `MANUUConnect ${cleanMessage}`,
            env,
            "linkedin.com"
          );

        if (linkedinResults.length) {
          context = buildWebContext(
            linkedinResults,
            "LinkedIn"
          );

          source = "LinkedIn";
        }
      }

      /*
        4. If nothing was found, still send the
           question to AI. The model decides whether
           it has enough general knowledge to answer.
      */
      if (!context) {
        context =
          "No MANUUConnect-specific information was retrieved from the knowledge base or trusted web sources.";
      }

      /*
        5. One single AI prompt.
        No question-specific routing.
      */
      const systemPrompt = `
You are MANUUConnect AI.

You are a helpful assistant for the MANUUConnect
student community.

Use the retrieved information as your primary
source for MANUUConnect-specific facts.

IMPORTANT:
- Do not invent MANUUConnect facts.
- Do not replace missing MANUUConnect facts with guesses.
- If the retrieved information does not contain a
  reliable MANUUConnect fact, say:
  "I don't have that information yet."
- For general student guidance, you may give useful
  general advice.
- Normal conversation is allowed.

Answer the user's actual question.

Formatting:
- Use short paragraphs.
- Leave a blank line between sections.
- Use bullet points for lists.
- Use numbered lists when appropriate.
- Do not put unnecessary Markdown symbols around headings.
- Do not repeat the user's question.
- Keep the answer concise.

USER QUESTION:
${cleanMessage}

RETRIEVED INFORMATION:
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
          max_tokens: 500
        }
      );

      const reply =
        result?.response?.trim() ||
        "I don't have an answer for that right now.";

      return jsonResponse({
        reply,
        source,
        vectorScore: bestScore || null
      });

    } catch (error) {
      console.error(
        "MANUUConnect AI error:",
        error
      );

      return jsonResponse(
        {
          error:
            "Sorry, I couldn't connect to MANUUConnect AI right now. Please try again."
        },
        500
      );
    }
  }
};
