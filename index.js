
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    if (method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    try {
      // Health check
      if (path === "/api/health" && method === "GET") {
        return json({
          success: true,
          message: "AI Report API is running",
          timestamp: new Date().toISOString(),
        });
      }

      // Create new report
      if (path === "/api/reports" && method === "POST") {
        const body = await request.json();

        const { user_id, report_type, prompt, image_prompt } = body;

        if (!user_id || !prompt) {
          return json({
            success: false,
            message: "user_id and prompt are required",
          }, 400);
        }

        const reportId = crypto.randomUUID();
        const now = new Date().toISOString();

        await env.DB.prepare(`
          INSERT INTO reports (
            report_id,
            user_id,
            report_type,
            prompt,
            image_prompt,
            status,
            created_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `).bind(
          reportId,
          user_id,
          report_type || "image",
          prompt,
          image_prompt || "",
          "pending",
          now
        ).run();

        return json({
          success: true,
          message: "Report created successfully",
          data: {
            report_id: reportId,
            status: "pending",
            created_at: now,
          },
        }, 201);
      }

      // Get all reports
      if (path === "/api/reports" && method === "GET") {
        const result = await env.DB.prepare(`
          SELECT * FROM reports
          ORDER BY created_at DESC
          LIMIT 100
        `).all();

        return json({
          success: true,
          data: result.results,
        });
      }

      // Get report by ID
      if (path.startsWith("/api/reports/") && method === "GET") {
        const reportId = path.split("/").pop();

        const report = await env.DB.prepare(`
          SELECT * FROM reports WHERE report_id = ?
        `).bind(reportId).first();

        if (!report) {
          return json({
            success: false,
            message: "Report not found",
          }, 404);
        }

        return json({
          success: true,
          data: report,
        });
      }

      // Image generation endpoint
      if (path === "/api/images/generate" && method === "POST") {
        return json({
          success: false,
          message: "Image generation provider is not configured yet",
        }, 501);
      }

      return json({
        success: false,
        message: "API route not found",
      }, 404);

    } catch (error) {
      console.error("API Error:", error);

      return json({
        success: false,
        message: "Internal server error",
      }, 500);
    }
  },
};

