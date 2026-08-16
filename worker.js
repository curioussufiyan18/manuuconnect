export default {
  async fetch(request, env) {
    const result = await env.AI.run(
      "@cf/meta/llama-3.2-3b-instruct",
      {
        messages: [
          {
            role: "user",
            content:
              "Say hello to MANUUConnect in one short sentence.",
          },
        ],
        max_tokens: 50,
      }
    );

    return Response.json(result);
  },
};
