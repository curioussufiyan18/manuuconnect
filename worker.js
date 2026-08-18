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
  Convert the new knowledge structure into searchable records.
*/
function buildKnowledgeRecords() {
  const records = [];

  for (const [category, data] of Object.entries(knowledge)) {
    if (!data || typeof data !== "object") {
      continue;
    }

    const categoryType =
      data.type || category;

    const categoryTitle =
      data.title || category;

    const content =
      data.content;

    if (Array.isArray(content)) {
      content.forEach((item, index) => {
        if (!item || typeof item !== "object") {
          return;
        }

        const id =
          item.id ||
          `${category}-${index + 1}`;

        const title =
          item.title ||
          item.name ||
          item.question ||
          categoryTitle;

        const text = [
          `Category: ${category}`,
          `Type: ${item.type || categoryType}`,
          `Title: ${title}`,
          `Keywords: ${(data.keywords || []).join(", ")}`,
          JSON.stringify(item, null, 2)
        ].join("\n");

        records.push({
          id,
          category,
          type: item.type || categoryType,
          title,
          text
        });
      });

      continue;
    }

    const text = [
      `Category: ${category}`,
      `Type: ${categoryType}`,
      `Title: ${categoryTitle}`,
      `Keywords: ${(data.keywords || []).join(", ")}`,
      JSON.stringify(content, null, 2)
    ].join("\n");

    records.push({
      id: data.id || category,
      category,
      type: categoryType,
      title: categoryTitle,
      text
    });
  }

  return records;
}

function splitForEmbedding(text, maxChars = 1800) {
  if (text.length <= maxChars) {
    return [text];
  }

  const chunks = [];

  for (let i = 0; i < text.length; i += maxChars) {
    chunks.push(
      text.slice(i, i + maxChars)
    );
  }

  return chunks;
}

function buildEmbeddingRecords() {
  const sourceRecords =
    buildKnowledgeRecords();

  const output = [];

  for (const record of sourceRecords) {
    const chunks =
      splitForEmbedding(record.text);

    chunks.forEach((chunk, index) => {
      output.push({
        id:
          chunks.length === 1
            ? record.id
            : `${record.id}-chunk-${index + 1}`,

        category: record.category,
        type: record.type,
        title: record.title,
        text: chunk
      });
    });
  }

  return output;
}

/*
  One-time indexing route.

  Open:
  http://localhost:8787/index

  This generates embeddings and upserts them
  into your manuuconnect-index.
*/
async function indexKnowledge(env) {
  const records =
    buildEmbeddingRecords();

  if (!records.length) {
    throw new Error(
      "No knowledge records found."
    );
  }

  const texts =
    records.map(record => record.text);

  const embeddings =
    await env.AI.run(
      EMBEDDING_MODEL,
      {
        text: texts
      }
    );

  if (
    !embeddings ||
    !Array.isArray(embeddings.data)
  ) {
    throw new Error(
      "Embedding generation failed."
    );
  }

  if (
    embeddings.data.length !== records.length
  ) {
    throw new Error(
      `Embedding count mismatch. Expected ${records.length}, got ${embeddings.data.length}.`
    );
  }

  const vectors =
    records.map((record, index) => ({
      id: record.id,
      values: embeddings.data[index],

      metadata: {
        category: record.category,
        type: record.type,
        title: record.title,
        text: record.text
      }
    }));

  /*
    Upsert in batches.
  */
  const batchSize = 50;
  const results = [];

  for (
    let i = 0;
    i < vectors.length;
    i += batchSize
  ) {
    const batch =
      vectors.slice(
        i,
        i + batchSize
      );

    const result =
      await env.VECTORIZE.upsert(
        batch
      );

    results.push(result);
  }

  return {
    records: records.length,
    batches: results.length,
    results
  };
}

/*
  Semantic search.
*/
async function searchVectorize(
  query,
  env
) {
  const embedding =
    await env.AI.run(
      EMBEDDING_MODEL,
      {
        text: [query]
      }
    );

  const queryVector =
    embedding?.data?.[0];

  if (!queryVector) {
    throw new Error(
      "Failed to generate query embedding."
    );
  }

  const result =
    await env.VECTORIZE.query(
      queryVector,
      {
        topK: 5,
        returnMetadata: "all"
      }
    );

  return result?.matches || [];
}

/*
  Serper fallback.
*/
async function searchSerper(
  query,
  env,
  site
) {
  if (!env.SERPER_API_KEY) {
    return [];
  }

  const searchQuery =
    site
      ? `site:${site} ${query}`
      : query;

  try {
    const response =
      await fetch(
        "https://google.serper.dev/search",
        {
          method: "POST",

          headers: {
            "X-API-KEY":
              env.SERPER_API_KEY,

            "Content-Type":
              "application/json"
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
      return [];
    }

    const data =
      await response.json();

    return (
      data.organic || []
    ).map(item => ({
      title:
        item.title || "",

      link:
        item.link || "",

      snippet:
        item.snippet || ""
    }));

  } catch {
    return [];
  }
}

function formatWebResults(
  results,
  source
) {
  return results
    .map(
      (item, index) =>
        `[${source} ${index + 1}]
Title: ${item.title}
URL: ${item.link}
Snippet: ${item.snippet}`
    )
    .join("\n\n");
}

function isGreeting(message) {
  const q =
    normalize(message);

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
  const q =
    normalize(message);

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

    if (
      request.method === "OPTIONS"
    ) {
      return new Response(null, {
        status: 204,

        headers: {
          "Access-Control-Allow-Origin":
            "*",

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

    if (
      request.method === "GET"
    ) {

      const url =
        new URL(
          request.url
        );

      /*
        ONE-TIME INDEXING

        After it works, remove this route
        before production deployment.
      */

      if (
        url.pathname === "/index"
      ) {
        try {
          const result =
            await indexKnowledge(
              env
            );

          return jsonResponse({
            status: "indexed",
            ...result
          });

        } catch (error) {
          console.error(
            "Indexing error:",
            error
          );

          return jsonResponse(
            {
              error:
                error.message ||
                "Indexing failed."
            },
            500
          );
        }
      }

      return jsonResponse({
        status: "ok",
        service: "MANUUConnect AI",
        model: MODEL,
        embeddingModel:
          EMBEDDING_MODEL
      });
    }

    /*
      POST only for chat
    */

    if (
      request.method !== "POST"
    ) {
      return jsonResponse(
        {
          error:
            "Method not allowed."
        },
        405
      );
    }

    try {

      /*
        Read input
      */

      const body =
        await request.json();

      const message =
        body?.message;

      if (
        !message ||
        typeof message !== "string"
      ) {
        return jsonResponse(
          {
            error:
              "Please provide a message."
          },
          400
        );
      }

      const cleanMessage =
        message.trim();

      if (!cleanMessage) {
        return jsonResponse(
          {
            error:
              "Please provide a message."
          },
          400
        );
      }

      /*
        Greetings
      */

      if (
        isGreeting(
          cleanMessage
        )
      ) {
        return jsonResponse({
          reply:
            greetingResponse(
              cleanMessage
            ),

          source: null
        });
      }

      /*
        Vector search
      */

      const matches =
        await searchVectorize(
          cleanMessage,
          env
        );

      /*
        Cosine similarity is used by your
        Vectorize index.

        We use the strongest match as the
        initial confidence signal.
      */

      const bestScore =
        matches[0]?.score || 0;

      /*
        Start with a conservative threshold.
        We can tune this after testing.
      */

      const VECTOR_THRESHOLD = 0.55;

      const strongMatches =
        bestScore >= VECTOR_THRESHOLD
          ? matches
          : [];

      let context = "";
      let source = null;

      /*
        Strong Vectorize result
      */

      if (
        strongMatches.length > 0
      ) {

        context =
          strongMatches
            .map(match => {

              const metadata =
                match.metadata || {};

              return `[MANUUConnect Knowledge]
Category: ${metadata.category || ""}
Type: ${metadata.type || ""}
Title: ${metadata.title || ""}

${metadata.text || ""}`;

            })
            .join("\n\n");

        source =
          "MANUUConnect knowledge";
      }

      /*
        No strong Vectorize result:
        search official website.
      */

      if (
        !context
      ) {

        const websiteResults =
          await searchSerper(
            cleanMessage,
            env,
            "manuuconnect.in"
          );

        if (
          websiteResults.length > 0
        ) {

          context =
            `
Trusted external source:
manuuconnect.in

${formatWebResults(
  websiteResults,
  "manuuconnect.in"
)}
`;

          source =
            "manuuconnect.in";
        }
      }

      /*
        If official website has nothing,
        search LinkedIn.
      */

      if (
        !context
      ) {

        const linkedinResults =
          await searchSerper(
            `MANUUConnect ${cleanMessage}`,
            env,
            "linkedin.com"
          );

        if (
          linkedinResults.length > 0
        ) {

          context =
            `
Trusted external source:
LinkedIn

${formatWebResults(
  linkedinResults,
  "LinkedIn"
)}
`;

          source =
            "LinkedIn";
        }
      }

      /*
        Nothing found anywhere.
      */

      if (
        !context
      ) {
        context =
          `
No reliable MANUUConnect information
was found for this question.
`;
      }

      /*
        AI prompt
      */

      const systemPrompt = `
You are MANUUConnect AI.

You are the AI assistant for the
MANUUConnect student community.

Your job is to answer questions about:

- MANUUConnect
- Team members
- Mentors
- Alumni
- Events
- Projects
- Achievements
- Internships
- Referrals
- FAQs
- Student guidance
- Learning and career guidance

Priority:

1. MANUUConnect knowledge
2. manuuconnect.in
3. MANUUConnect LinkedIn

Use the provided information.

For factual MANUUConnect questions,
do not invent missing facts.

If reliable information is not provided,
say:

"I don't have that information yet."

For student guidance questions,
you may provide useful general guidance.

Keep responses short and readable.

Use proper paragraphs.

For multiple items, use bullet points
or numbered lists.

Leave blank lines between sections.

Do not repeat the user's question.

USER:
${cleanMessage}

RETRIEVED INFORMATION:
${context}
`;

      const result =
        await env.AI.run(
          MODEL,
          {
            messages: [
              {
                role: "system",
                content:
                  systemPrompt
              },

              {
                role: "user",
                content:
                  cleanMessage
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
        source,
        vectorScore:
          bestScore || null
      });

    } catch (error) {

      console.error(
        "MANUUConnect error:",
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
