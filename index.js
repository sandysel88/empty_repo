
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
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

function getDb(env) {
  if (!env.ai_report_db) {
    throw new Error("D1 database binding ai_report_db is missing");
  }
  return env.ai_report_db;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    if (method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: corsHeaders,
      });
    }

    try {
      const db = getDb(env);

      // 1. Health Check API
      if (path === "/api/health" && method === "GET") {
        return json({
          success: true,
          message: "AI Report API is running",
          timestamp: new Date().toISOString(),
        });
      }

      // 2. Create New Report API
      if (path === "/api/reports" && method === "POST") {
        let body;

        try {
          body = await request.json();
        } catch {
          return json({
            success: false,
            message: "Invalid JSON body",
          }, 400);
        }

        const {
          user_id,
          report_type,
          prompt,
          image_prompt,
        } = body;

        if (
          typeof user_id !== "string" ||
          !user_id.trim() ||
          typeof prompt !== "string" ||
          !prompt.trim()
        ) {
          return json({
            success: false,
            message: "Valid user_id and prompt are required",
          }, 400);
        }

        const reportId = crypto.randomUUID();
        const now = new Date().toISOString();

        await db.prepare(`
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
          user_id.trim(),
          report_type || "image",
          prompt.trim(),
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

      // 3. Get All Reports API
      if (path === "/api/reports" && method === "GET") {
        const limitParam = Number(url.searchParams.get("limit") || 100);
        const limit = Math.min(
          Math.max(Number.isInteger(limitParam) ? limitParam : 100, 1),
          100
        );

        const result = await db.prepare(`
          SELECT
            id,
            report_id,
            user_id,
            report_type,
            prompt,
            image_prompt,
            image_url,
            status,
            created_at,
            updated_at
          FROM reports
          ORDER BY created_at DESC
          LIMIT ?
        `).bind(limit).all();

        return json({
          success: true,
          total: result.results.length,
          data: result.results,
        });
      }

      // 4. Get Single Report API
      if (
        path.startsWith("/api/reports/") &&
        method === "GET"
      ) {
        const reportId = path.split("/").pop();

        if (!reportId) {
          return json({
            success: false,
            message: "Report ID is required",
          }, 400);
        }

        const report = await db.prepare(`
          SELECT *
          FROM reports
          WHERE report_id = ?
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

      // 5. Update Report Status API
      if (
        path.startsWith("/api/reports/") &&
        method === "PUT"
      ) {
        const reportId = path.split("/").pop();

        let body;

        try {
          body = await request.json();
        } catch {
          return json({
            success: false,
            message: "Invalid JSON body",
          }, 400);
        }

        const allowedStatuses = [
          "pending",
          "processing",
          "completed",
          "failed",
        ];

        if (!allowedStatuses.includes(body.status)) {
          return json({
            success: false,
            message: "Invalid report status",
          }, 400);
        }

        const now = new Date().toISOString();

        const result = await db.prepare(`
          UPDATE reports
          SET status = ?, updated_at = ?
          WHERE report_id = ?
        `).bind(
          body.status,
          now,
          reportId
        ).run();

        if (!result.meta.changes) {
          return json({
            success: false,
            message: "Report not found",
          }, 404);
        }

        return json({
          success: true,
          message: "Report status updated",
          report_id: reportId,
          status: body.status,
        });
      }

      // 6. Delete Report API
      if (
        path.startsWith("/api/reports/") &&
        method === "DELETE"
      ) {
        const reportId = path.split("/").pop();

        const result = await db.prepare(`
          DELETE FROM reports
          WHERE report_id = ?
        `).bind(reportId).run();

        if (!result.meta.changes) {
          return json({
            success: false,
            message: "Report not found",
          }, 404);
        }

        return json({
          success: true,
          message: "Report deleted successfully",
          report_id: reportId,
        });
      }

      // 7. Image Generation API
      if (
        path === "/api/images/generate" &&
        method === "POST"
      ) {
        return json({
          success: false,
          message: "Image generation provider is not configured yet",
        }, 501);
      }

      // 8. Route Not Found
      return json({
        success: false,
        message: "API route not found",
        path,
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
