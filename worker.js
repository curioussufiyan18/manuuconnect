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

/* ==============================
   KNOWLEDGE HELPERS
============================== */

function getRecords(category) {
  const data = knowledge?.[category];

  if (!data) {
    return [];
  }

  return Array.isArray(data.content)
    ? data.content
    : [];
}

function getTeamRecords() {
  return getRecords("team");
}

function getMentorRecords() {
  return getRecords("mentors");
}

function getEventRecords() {
  return getRecords("events");
}

function parseDate(dateString) {
  if (!dateString) {
    return 0;
  }

  const parts = String(dateString).split("/");

  if (parts.length !== 3) {
    return 0;
  }

  const day = Number(parts[0]);
  const month = Number(parts[1]);
  const year = Number(parts[2]);

  const date = new Date(
    year,
    month - 1,
    day
  );

  return date.getTime();
}

/* ==============================
   ABOUT
============================== */

function getAboutAnswer(message) {
  const q = normalize(message);

  const isAboutQuestion =
    q === "what is manuuconnect" ||
    q === "what is manuu connect" ||
    q.includes("tell me about manuuconnect") ||
    q.includes("tell me about manuu connect") ||
    q.includes("what does manuuconnect do") ||
    q.includes("what does manuu connect do") ||
    q.includes("what is the purpose of manuuconnect") ||
    q.includes("what is the purpose of manuu connect");

  if (!isAboutQuestion) {
    return null;
  }

  const faq =
    knowledge?.faq?.content || [];

  const faqItem = faq.find(
    item =>
      normalize(item.question) ===
      "what is manuu connect"
  );

  if (faqItem?.answer) {
    return faqItem.answer;
  }

  const about =
    knowledge?.about?.content;

  if (about?.description) {
    return about.description;
  }

  return null;
}

/* ==============================
   TEAM
============================== */

function isTeamListQuestion(message) {
  const q = normalize(message);

  return (
    q.includes("who are the team members") ||
    q.includes("who are all the team members") ||
    q.includes("who is on the team") ||
    q.includes("who are on the team") ||
    q.includes("list all team members") ||
    q.includes("list the team members") ||
    q.includes("show all team members") ||
    q.includes("show the team members") ||
    q.includes("all team members") ||
    q.includes("all team") ||
    q === "team members" ||
    q === "team member" ||
    q === "about team" ||
    q === "about the team" ||
    q.includes("tell me about the team") ||
    q.includes("tell me about team") ||
    q.includes("core team") ||
    q.includes("complete team")
  );
}

function isTeamCountQuestion(message) {
  const q = normalize(message);

  return (
    q.includes("how many team members") ||
    q.includes("how many members are on the team") ||
    q.includes("number of team members") ||
    q.includes("how many people are on the team") ||
    q.includes("how many people in the team") ||
    q === "how many members"
  );
}

function getTeamOverviewAnswer(message) {
  const q = normalize(message);

  if (
    q !== "about team" &&
    q !== "about the team" &&
    !q.includes("tell me about the team") &&
    !q.includes("tell me about team")
  ) {
    return null;
  }

  const team = getTeamRecords();

  if (!team.length) {
    return null;
  }

  return (
    `MANUUConnect's current team has ${team.length} members.\n\n` +
    `The team includes developers, design, social media, coordination, and Tech & AI roles.`
  );
}

function getTeamMemberAnswer(message) {
  const q = normalize(message);
  const team = getTeamRecords();

  if (!team.length) {
    return null;
  }

  const backendQuestion =
    q.includes("backend developer") ||
    q.includes("who handles backend") ||
    q.includes("who does backend") ||
    q.includes("who is the backend developer");

  if (backendQuestion) {
    const member = team.find(
      item =>
        normalize(item.position) ===
        "backend developer"
    );

    if (member) {
      return `${member.name} is the Backend Developer.`;
    }
  }

  for (const member of team) {
    const name = normalize(member.name);

    if (
      q === name ||
      q.includes(name)
    ) {
      return `${member.name} is the ${member.position}.`;
    }

    for (const alias of member.aliases || []) {
      const aliasName = normalize(alias);

      if (
        aliasName.length > 2 &&
        q.includes(aliasName)
      ) {
        return `${member.name} is the ${member.position}.`;
      }
    }
  }

  return null;
}

function getTeamListAnswer() {
  const team = getTeamRecords();

  if (!team.length) {
    return null;
  }

  return (
    `MANUUConnect has ${team.length} current team members:\n\n` +
    team
      .map(
        (member, index) =>
          `${index + 1}. ${member.name} - ${member.position}`
      )
      .join("\n")
  );
}

function getTeamCountAnswer() {
  const team = getTeamRecords();

  if (!team.length) {
    return null;
  }

  return `The current team has ${team.length} members.`;
}

/* ==============================
   MENTORS
============================== */

function isMentorListQuestion(message) {
  const q = normalize(message);

  return (
    q.includes("who are the mentors") ||
    q.includes("who are all the mentors") ||
    q.includes("list all mentors") ||
    q.includes("list the mentors") ||
    q.includes("show all mentors") ||
    q.includes("show the mentors") ||
    q.includes("all mentors") ||
    q === "mentors" ||
    q === "mentor list" ||
    q.includes("mentor network")
  );
}

function isMentorCountQuestion(message) {
  const q = normalize(message);

  return (
    q.includes("how many mentors") ||
    q.includes("number of mentors")
  );
}

function getMentorListAnswer() {
  const mentors = getMentorRecords();

  if (!mentors.length) {
    return null;
  }

  return (
    `The current mentor directory contains ${mentors.length} mentors/alumni:\n\n` +
    mentors
      .map((mentor, index) => {
        const organization =
          mentor.company ||
          mentor.organization ||
          "";

        const role =
          mentor.role || "";

        const suffix = organization
          ? ` - ${role} at ${organization}`
          : ` - ${role}`;

        return `${index + 1}. ${mentor.name}${suffix}`;
      })
      .join("\n")
  );
}

function getMentorCountAnswer() {
  const mentors = getMentorRecords();

  if (!mentors.length) {
    return null;
  }

  return `The current mentor directory contains ${mentors.length} mentors/alumni.`;
}

/* ==============================
   EVENTS
============================== */

function isLatestEventQuestion(message) {
  const q = normalize(message);

  return (
    q.includes("latest event") ||
    q.includes("latest events") ||
    q.includes("most recent event") ||
    q.includes("recent event") ||
    q.includes("newest event")
  );
}

function isUpcomingEventQuestion(message) {
  const q = normalize(message);

  return (
    q.includes("upcoming event") ||
    q.includes("upcoming events") ||
    q.includes("next event")
  );
}

function getLatestEventAnswer() {
  const events = getEventRecords();

  if (!events.length) {
    return null;
  }

  const sorted = [...events].sort(
    (a, b) =>
      parseDate(b.date) -
      parseDate(a.date)
  );

  return formatEvent(sorted[0]);
}

function getUpcomingEventAnswer() {
  const events = getEventRecords();

  if (!events.length) {
    return null;
  }

  const now = Date.now();

  const upcoming = [...events]
    .filter(event => parseDate(event.date) >= now)
    .sort(
      (a, b) =>
        parseDate(a.date) -
        parseDate(b.date)
    );

  if (!upcoming.length) {
    return "I don't have an upcoming event in the current knowledge base.";
  }

  return formatEvent(upcoming[0]);
}

function getSpecificEventAnswer(message) {
  const q = normalize(message);
  const events = getEventRecords();

  if (!events.length) {
    return null;
  }

  const event = events.find(item => {
    const title = normalize(item.title);

    if (q.includes(title)) {
      return true;
    }

    if (
      q.includes("summer sprint") &&
      title.includes("summer sprint")
    ) {
      return true;
    }

    if (
      q.includes("career guidance") &&
      title.includes("career guidance")
    ) {
      return true;
    }

    if (
      q.includes("git github") &&
      title.includes("git github")
    ) {
      return true;
    }

    if (
      q.includes("next gen") &&
      title.includes("next gen")
    ) {
      return true;
    }

    return false;
  });

  if (!event) {
    return null;
  }

  return formatEvent(event);
}

function formatEvent(event) {
  const lines = [
    `${event.title}`,
    "",
    `Date: ${event.date}`,
    `Participants: ${event.participants}`,
    `Speakers: ${event.speakers.join(", ")}`
  ];

  if (
    Array.isArray(event.topics) &&
    event.topics.length
  ) {
    lines.push("");
    lines.push("Topics:");

    for (const topic of event.topics) {
      lines.push(`• ${topic}`);
    }
  }

  return lines.join("\n");
}

/* ==============================
   STRUCTURED ROUTER
============================== */

function getStructuredAnswer(message) {
  const teamOverview =
    getTeamOverviewAnswer(message);

  if (teamOverview) {
    return teamOverview;
  }

  const aboutAnswer =
    getAboutAnswer(message);

  if (aboutAnswer) {
    return aboutAnswer;
  }

  const teamMemberAnswer =
    getTeamMemberAnswer(message);

  if (teamMemberAnswer) {
    return teamMemberAnswer;
  }

  if (isTeamListQuestion(message)) {
    return getTeamListAnswer();
  }

  if (isTeamCountQuestion(message)) {
    return getTeamCountAnswer();
  }

  if (isMentorListQuestion(message)) {
    return getMentorListAnswer();
  }

  if (isMentorCountQuestion(message)) {
    return getMentorCountAnswer();
  }

  if (isLatestEventQuestion(message)) {
    return getLatestEventAnswer();
  }

  if (isUpcomingEventQuestion(message)) {
    return getUpcomingEventAnswer();
  }

  const eventAnswer =
    getSpecificEventAnswer(message);

  if (eventAnswer) {
    return eventAnswer;
  }

  return null;
}

/* ==============================
   VECTORIZE
============================== */

function buildKnowledgeRecords() {
  const records = [];

  for (
    const [category, data]
    of Object.entries(knowledge)
  ) {
    if (
      !data ||
      typeof data !== "object"
    ) {
      continue;
    }

    const categoryType =
      data.type || category;

    const categoryTitle =
      data.title || category;

    const content =
      data.content;

    if (Array.isArray(content)) {
      content.forEach(
        (item, index) => {
          if (
            !item ||
            typeof item !== "object"
          ) {
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
            type:
              item.type ||
              categoryType,
            title,
            text
          });
        }
      );

      continue;
    }

    const text = [
      `Category: ${category}`,
      `Type: ${categoryType}`,
      `Title: ${categoryTitle}`,
      `Keywords: ${(data.keywords || []).join(", ")}`,
      JSON.stringify(
        content,
        null,
        2
      )
    ].join("\n");

    records.push({
      id:
        data.id ||
        category,

      category,

      type:
        categoryType,

      title:
        categoryTitle,

      text
    });
  }

  return records;
}

function splitForEmbedding(
  text,
  maxChars = 1800
) {
  if (
    text.length <= maxChars
  ) {
    return [text];
  }

  const chunks = [];

  for (
    let i = 0;
    i < text.length;
    i += maxChars
  ) {
    chunks.push(
      text.slice(
        i,
        i + maxChars
      )
    );
  }

  return chunks;
}

function buildEmbeddingRecords() {
  const sourceRecords =
    buildKnowledgeRecords();

  const output = [];

  for (
    const record of sourceRecords
  ) {
    const chunks =
      splitForEmbedding(
        record.text
      );

    chunks.forEach(
      (chunk, index) => {
        output.push({
          id:
            chunks.length === 1
              ? record.id
              : `${record.id}-chunk-${index + 1}`,

          category:
            record.category,

          type:
            record.type,

          title:
            record.title,

          text:
            chunk
        });
      }
    );
  }

  return output;
}

async function indexKnowledge(env) {
  const records =
    buildEmbeddingRecords();

  if (!records.length) {
    throw new Error(
      "No knowledge records found."
    );
  }

  const batchSize = 50;
  const results = [];

  for (
    let start = 0;
    start < records.length;
    start += batchSize
  ) {
    const batch =
      records.slice(
        start,
        start + batchSize
      );

    const embeddings =
      await env.AI.run(
        EMBEDDING_MODEL,
        {
          text:
            batch.map(
              record =>
                record.text
            )
        }
      );

    if (
      !embeddings ||
      !Array.isArray(
        embeddings.data
      )
    ) {
      throw new Error(
        "Embedding generation failed."
      );
    }

    const vectors =
      batch.map(
        (record, index) => ({
          id:
            record.id,

          values:
            embeddings.data[index],

          metadata: {
            category:
              record.category,

            type:
              record.type,

            title:
              record.title,

            text:
              record.text
          }
        })
      );

    const result =
      await env.VECTORIZE.upsert(
        vectors
      );

    results.push(result);
  }

  return {
    records:
      records.length,

    batches:
      results.length,

    results
  };
}

async function searchVectorize(
  query,
  env
) {
  try {
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
      console.error(
        "No query embedding returned."
      );

      return [];
    }

    const result =
      await env.VECTORIZE.query(
        queryVector,
        {
          topK: 8,
          returnMetadata:
            "all"
        }
      );

    return (
      result?.matches ||
      []
    );
  } catch (error) {
    console.error(
      "Vectorize search failed:",
      error
    );

    return [];
  }
}

/* ==============================
   SERPER FALLBACK
============================== */

async function searchSerper(
  query,
  env,
  site
) {
  if (
    !env.SERPER_API_KEY
  ) {
    return [];
  }

  const searchQuery =
    `site:${site} ${query}`;

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

          body:
            JSON.stringify({
              q:
                searchQuery,

              gl:
                "in",

              hl:
                "en",

              num:
                5
            })
        }
      );

    if (
      !response.ok
    ) {
      console.error(
        "Serper returned:",
        response.status
      );

      return [];
    }

    const data =
      await response.json();

    return (
      data.organic ||
      []
    ).map(
      item => ({
        title:
          item.title || "",

        link:
          item.link || "",

        snippet:
          item.snippet || ""
      })
    );
  } catch (error) {
    console.error(
      "Serper search failed:",
      error
    );

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

/* ==============================
   GREETINGS
============================== */

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

/* ==============================
   WORKER
============================== */

export default {
  async fetch(
    request,
    env
  ) {
    /* CORS */

    if (
      request.method ===
      "OPTIONS"
    ) {
      return new Response(
        null,
        {
          status: 204,

          headers: {
            "Access-Control-Allow-Origin":
              "*",

            "Access-Control-Allow-Methods":
              "GET, POST, OPTIONS",

            "Access-Control-Allow-Headers":
              "Content-Type"
          }
        }
      );
    }

    /* GET */

    if (
      request.method === "GET"
    ) {
      const url =
        new URL(
          request.url
        );

      /*
        Temporary indexing route.
      */

      if (
        url.pathname ===
        "/index"
      ) {
        try {
          const result =
            await indexKnowledge(
              env
            );

          return jsonResponse({
            status:
              "indexed",

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
        status:
          "ok",

        service:
          "MANUUConnect AI",

        model:
          MODEL,

        embeddingModel:
          EMBEDDING_MODEL
      });
    }

    /* POST */

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
      const body =
        await request.json();

      const message =
        body?.message;

      if (
        !message ||
        typeof message !==
          "string"
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

      if (
        !cleanMessage
      ) {
        return jsonResponse(
          {
            error:
              "Please provide a message."
          },
          400
        );
      }

      if (
        cleanMessage.length >
        1000
      ) {
        return jsonResponse(
          {
            error:
              "Message is too long."
          },
          400
        );
      }

      /* Greeting */

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

          source:
            null
        });
      }

      /*
        Structured answer FIRST.
        These questions should never depend
        on Vectorize.
      */

      const structuredAnswer =
        getStructuredAnswer(
          cleanMessage
        );

      if (
        structuredAnswer
      ) {
        return jsonResponse({
          reply:
            structuredAnswer,

          source:
            "MANUUConnect knowledge"
        });
      }

      /*
        Semantic Vectorize search.
      */

      const matches =
        await searchVectorize(
          cleanMessage,
          env
        );

      const bestScore =
        matches[0]?.score ||
        0;

      const VECTOR_THRESHOLD =
        0.55;

      const strongMatches =
        bestScore >=
        VECTOR_THRESHOLD
          ? matches
          : [];

      let context =
        "";

      let source =
        null;

      if (
        strongMatches.length
      ) {
        context =
          strongMatches
            .map(
              match => {
                const metadata =
                  match.metadata ||
                  {};

                return `[MANUUConnect Knowledge]
Category: ${metadata.category || ""}
Type: ${metadata.type || ""}
Title: ${metadata.title || ""}

${metadata.text || ""}`;
              }
            )
            .join(
              "\n\n"
            );

        source =
          "MANUUConnect knowledge";
      }

      /*
        Website fallback.
      */

      if (!context) {
        const results =
          await searchSerper(
            cleanMessage,
            env,
            "manuuconnect.in"
          );

        if (
          results.length
        ) {
          context =
            `
Trusted external source:
manuuconnect.in

${formatWebResults(
  results,
  "manuuconnect.in"
)}
`;

          source =
            "manuuconnect.in";
        }
      }

      /*
        LinkedIn fallback.
      */

      if (!context) {
        const results =
          await searchSerper(
            `MANUUConnect ${cleanMessage}`,
            env,
            "linkedin.com"
          );

        if (
          results.length
        ) {
          context =
            `
Trusted external source:
LinkedIn

${formatWebResults(
  results,
  "LinkedIn"
)}
`;

          source =
            "LinkedIn";
        }
      }

      /*
        Nothing found.
      */

      if (!context) {
        context =
          `
No reliable MANUUConnect
information was found.
`;
      }

      /*
        AI fallback.
      */

      const systemPrompt =
        `
You are MANUUConnect AI.

You are the assistant for the
MANUUConnect community.

You help with:

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
- Learning guidance
- Career guidance

Use the provided information.

For MANUUConnect facts,
do not invent facts.

If reliable information
is not available, say:

"I don't have that information yet."

Normal conversation is allowed.

For general student guidance,
you may provide useful advice.

Keep answers short.

Use short paragraphs.

Use bullet points or numbered
lists when useful.

Leave blank lines between
separate sections.

Do not repeat the question.

USER QUESTION:

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
                role:
                  "system",

                content:
                  systemPrompt
              },

              {
                role:
                  "user",

                content:
                  cleanMessage
              }
            ],

            max_tokens:
              300
          }
        );

      const reply =
        result?.response?.trim() ||
        "I don't have an answer for that right now.";

      return jsonResponse({
        reply,

        source,

        vectorScore:
          bestScore ||
          null
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
