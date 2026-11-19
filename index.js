
// Gemini AI Image Generation API
if (path === "/api/images/generate" && method === "POST") {
  if (!env.GEMINI_API_KEY) {
    return json({
      success: false,
      message: "Gemini API key is missing"
    }, 500);
  }

  let body;

  try {
    body = await request.json();
  } catch {
    return json({
      success: false,
      message: "Invalid JSON body"
    }, 400);
  }

  const { report_id } = body;

  if (!report_id) {
    return json({
      success: false,
      message: "report_id is required"
    }, 400);
  }

  const report = await env.ai_report_db.prepare(`
    SELECT * FROM reports WHERE report_id = ?
  `).bind(report_id).first();

  if (!report) {
    return json({
      success: false,
      message: "Report not found"
    }, 404);
  }

  const prompt = report.image_prompt || report.prompt;

  try {
    await env.ai_report_db.prepare(`
      UPDATE reports SET status = ?, updated_at = ?
      WHERE report_id = ?
    `).bind(
      "processing",
      new Date().toISOString(),
      report_id
    ).run();

    const geminiResponse = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/interactions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": env.GEMINI_API_KEY
        },
        body: JSON.stringify({
          model: "gemini-3.1-flash-image",
          input: [
            {
              type: "text",
              text: prompt
            }
          ],
          response_format: {
            type: "image",
            aspect_ratio: "1:1"
          }
        })
      }
    );

    const result = await geminiResponse.json();

    if (!geminiResponse.ok) {
      throw new Error(
        result.error?.message || "Gemini API request failed"
      );
    }

    let generatedImage = result.output_image;

    if (!generatedImage && result.steps) {
      for (const step of result.steps) {
        if (step.type === "model_output" && step.content) {
          generatedImage = step.content.find(
            item => item.type === "image"
          );

          if (generatedImage) break;
        }
      }
    }

    if (!generatedImage?.data) {
      throw new Error("Gemini did not return an image");
    }

    const now = new Date().toISOString();

    await env.ai_report_db.prepare(`
      UPDATE reports
      SET status = ?, api_response = ?, updated_at = ?
      WHERE report_id = ?
    `).bind(
      "completed",
      JSON.stringify({
        provider: "Gemini",
        model: "gemini-3.1-flash-image",
        interaction_id: result.id || null,
        mime_type: generatedImage.mime_type || "image/png"
      }),
      now,
      report_id
    ).run();

    return json({
      success: true,
      message: "Image generated successfully",
      data: {
        report_id,
        status: "completed",
        mime_type: generatedImage.mime_type || "image/png",
        image_base64: generatedImage.data
      }
    });

  } catch (error) {
    console.error("Gemini Error:", error);

    await env.ai_report_db.prepare(`
      UPDATE reports
      SET status = ?, api_response = ?, updated_at = ?
      WHERE report_id = ?
    `).bind(
      "failed",
      JSON.stringify({ error: error.message }),
      new Date().toISOString(),
      report_id
    ).run();

    return json({
      success: false,
      message: "Image generation failed",
      error: error.message
    }, 502);
  }
}
