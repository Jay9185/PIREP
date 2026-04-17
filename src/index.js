export default {
  // ==========================================
  // 1. FETCH HANDLER: Handles Telegram Interactions
  // ==========================================
  async fetch(request, env, ctx) {
    if (request.method !== "POST") return new Response("OK");
    const payload = await request.json();
    const TELEGRAM_URL = `https://api.telegram.org/bot${env.BOT_TOKEN}`;

    const callTg = async (method, body) => {
      await fetch(`${TELEGRAM_URL}/${method}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
    };

    const now = Math.floor(Date.now() / 1000);

    // COMMAND: /status
    if (payload.message?.text?.startsWith("/status")) {
      const chatId = payload.message.chat.id;
      const dbData = await env.DB.prepare("SELECT area, turb_score, wind_score, obs_time, confidence FROM reports WHERE obs_time > ?").bind(now - 14400).all();
      
      if (!dbData.results || dbData.results.length === 0) {
        await callTg("sendMessage", { chat_id: chatId, text: "📍 **NORTH SECTOR STATUS**\n\nNo reports in the last 4 hours." });
        return new Response("OK");
      }

      // Dynamic Decay Math (MST = UTC-7)
      const currentHour = new Date(now * 1000).getUTCHours() - 7;
      let lambda = (currentHour >= 11 && currentHour <= 16) ? 0.02 : (currentHour < 9 || currentHour > 19) ? 0.005 : 0.01;

      const areas = {};
      dbData.results.forEach(row => {
        if (!areas[row.area]) areas[row.area] = { tW: 0, wW: 0, totalW: 0, latest: 0, count: 0 };
        const minsAgo = Math.max(0, (now - row.obs_time) / 60);
        const weight = Math.exp(-lambda * minsAgo) * (row.confidence || 1.0);
        areas[row.area].tW += (row.turb_score * weight);
        areas[row.area].wW += (row.wind_score * weight);
        areas[row.area].totalW += weight;
        areas[row.area].count += 1;
        if (row.obs_time > areas[row.area].latest) areas[row.area].latest = row.obs_time;
      });

      let board = "📍 *NORTH SECTOR STATUS*\n_Live cadet feedback_\n\n";
      for (const [area, d] of Object.entries(areas)) {
        board += `*${area}*\n🌪️ Turb: *${(d.tW/d.totalW).toFixed(1)}* | 💨 Wind: *${(d.wW/d.totalW).toFixed(1)}*\n_Last: ${Math.floor((now-d.latest)/60)}m ago (${d.count} reports)_\n\n`;
      }
      await callTg("sendMessage", { chat_id: chatId, text: board, parse_mode: "Markdown" });
      return new Response("OK");
    }

    // COMMAND: /landed
    if (payload.message?.text?.startsWith("/landed")) {
      const last = await env.DB.prepare("SELECT MAX(reported_at) as t FROM reports WHERE user_id = ?").bind(payload.message.from.id).first();
      if (last?.t && (now - last.t < 900)) {
        await callTg("sendMessage", { chat_id: payload.message.chat.id, text: "🛑 Cooldown active. Wait 15 mins." });
        return new Response("OK");
      }
      await callTg("sendMessage", {
        chat_id: payload.message.chat.id,
        text: "📍 **New PIREP**\nWhere did you just fly?",
        reply_markup: {
          inline_keyboard: [
            [{ text: "SATR", callback_data: "a_satr" }],
            [{ text: "LOCAL PATTERNS", callback_data: "a_loc" }],
            [{ text: "Anthem (North side)", callback_data: "a_ant" }]
          ]
        }
      });
      return new Response("OK");
    }

    // INTERACTIVE CALLBACKS
    if (payload.callback_query) {
      const q = payload.callback_query;
      const data = q.data;
      if (data.startsWith("a_")) {
        await callTg("editMessageText", { chat_id: q.message.chat.id, message_id: q.message.message_id, text: "⏱️ When was this?", 
          reply_markup: { inline_keyboard: [[{ text: "Just Landed", callback_data: `t_0|${data.split("_")[1]}` }, { text: "1h Ago", callback_data: `t_60|${data.split("_")[1]}` }, { text: "2h+ Ago", callback_data: `t_120|${data.split("_")[1]}` }]] } 
        });
      } else if (data.startsWith("t_")) {
        const p = data.split("|");
        const legend = "🌪️ **Turbulence Legend**\n1: Glassy\n2: Light Bumps\n3: Constant Corrections\n4: Heavy (±10kts IAS)\n5: Unsafe (RTB Suggested)";
        await callTg("editMessageText", { chat_id: q.message.chat.id, message_id: q.message.message_id, text: legend, parse_mode: "Markdown",
          reply_markup: { inline_keyboard: [[1,2,3,4,5].map(v => ({ text: v.toString(), callback_data: `u_${v}|${p[0].replace("t_","")}|${p[1]}` }))] } 
        });
      } else if (data.startsWith("u_")) {
        const p = data.split("|");
        const legend = "💨 **Winds/Gusts Legend**\n1: Calm (<5kts)\n2: Within Solo Mins\n3: At Personal Mins\n4: Exceeding Solo Mins\n5: Hazardous (Divert)";
        await callTg("editMessageText", { chat_id: q.message.chat.id, message_id: q.message.message_id, text: legend, parse_mode: "Markdown",
          reply_markup: { inline_keyboard: [[1,2,3,4,5].map(v => ({ text: v.toString(), callback_data: `w_${v}|${p[0].replace("u_","")}|${p[1]}|${p[2]}` }))] } 
        });
      } else if (data.startsWith("w_")) {
        const p = data.split("|");
        const areaMap = { 'satr': 'SATR', 'loc': 'LOCAL PATTERNS', 'ant': 'Anthem (North side)' };
        const areaName = areaMap[p[3]];
        const turb = parseInt(p[1]);
        const wind = parseInt(p[0].replace("w_",""));
        
        let confidence = 1.0;
        const recent = await env.DB.prepare("SELECT avg(turb_score) as avgT, count(*) as c FROM reports WHERE area = ? AND obs_time > ?").bind(areaName, now - 7200).first();
        if (recent?.c >= 2 && Math.abs(turb - recent.avgT) >= 2.5) confidence = 0.2;

        await env.DB.prepare("INSERT INTO reports (user_id, area, turb_score, wind_score, obs_time, reported_at, confidence) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)")
          .bind(q.from.id, areaName, turb, wind, now - (parseInt(p[2])*60), now, confidence).run();
        await callTg("editMessageText", { chat_id: q.message.chat.id, message_id: q.message.message_id, text: `✅ Saved for ${areaName}!` });
      }
      await callTg("answerCallbackQuery", { callback_query_id: q.id });
    }
    return new Response("OK");
  },

  // ==========================================
  // 2. SCHEDULED HANDLER: Vibe Shift Logic
  // ==========================================
  async scheduled(event, env, ctx) {
    const now = Math.floor(Date.now() / 1000);
    const GROUP_ID = env.GROUP_ID;
    const TELEGRAM_URL = `https://api.telegram.org/bot${env.BOT_TOKEN}/sendMessage`;
    const recent = await env.DB.prepare("SELECT area, AVG(turb_score) as avgT, COUNT(*) as c FROM reports WHERE obs_time > ? GROUP BY area").bind(now - 1800).all();
    for (const areaRow of recent.results) {
      if (areaRow.c < 2) continue;
      const baseline = await env.DB.prepare("SELECT AVG(turb_score) as avgT FROM reports WHERE area = ? AND obs_time BETWEEN ? AND ?")
        .bind(areaRow.area, now - 7200, now - 1800).first();
      if (baseline?.avgT && (areaRow.avgT - baseline.avgT >= 1.0)) {
        const msg = `🚨 *VIBE SHIFT DETECTED*\n\nConditions in *${areaRow.area}* are degrading.\n📈 Turb: *${areaRow.avgT.toFixed(1)}* (+${(areaRow.avgT-baseline.avgT).toFixed(1)})\n\n_Plan accordingly._`;
        await fetch(TELEGRAM_URL, { method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chat_id: GROUP_ID, text: msg, parse_mode: "Markdown" })
        });
      }
    }
  }
};
