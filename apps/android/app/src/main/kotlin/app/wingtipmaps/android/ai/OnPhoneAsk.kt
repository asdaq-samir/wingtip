package app.wingtipmaps.android.ai

import android.annotation.SuppressLint
import android.app.Application
import android.content.Intent
import androidx.core.net.toUri
import app.wingtipmaps.android.MainActivity
import app.wingtipmaps.android.R
import app.wingtipmaps.android.ai.functions.AgentTools
import app.wingtipmaps.android.api.Assistant
import app.wingtipmaps.android.api.AssistantContext
import app.wingtipmaps.android.api.AssistantLine
import app.wingtipmaps.android.api.AssistantSource
import com.google.mlkit.genai.prompt.Content
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.channelFlow
import org.xmlpull.v1.XmlPullParser

/**
 * Ask answered on the phone by Gemini Nano (docs/android-ai.md), with the
 * app's own AppFunctions as its tools (AgentTools): the airport, the
 * route, the NOTAMs, the Brief, the airplanes and logbook, and the app
 * opened where the pilot asks. Its lines are AssistantLine's, folded
 * into the conversation Ask draws; nothing of the question
 * leaves the phone except what a tool itself fetches from the planner, as
 * the screens fetch it. Its words pass FigureGuard against what the tools
 * answered, the plan and the question.
 */
object OnPhoneAsk {
    /** The application, for the tools and opening the app's activity; set
     *  once at launch (WingtipApplication). */
    @SuppressLint("StaticFieldLeak")
    private lateinit var app: Application

    fun attach(application: Application) {
        app = application
    }

    private val tools: AgentTools by lazy { AgentTools(app, ::open) }

    /** What every agent is told of the app: the AppFunctions metadata's
     *  instructions, read from the same XML Gemini reads. */
    private val instructions: String by lazy {
        val xml = app.resources.getXml(R.xml.app_functions_metadata)
        xml.use {
            while (it.eventType != XmlPullParser.START_TAG && it.eventType != XmlPullParser.END_DOCUMENT) it.next()
            it.getAttributeValue("http://schemas.android.com/apk/res-auto", "instructions").orEmpty()
        }
    }

    fun stream(messages: List<Assistant.Message>, context: AssistantContext?): Flow<AssistantLine> = channelFlow {
        val plan = contextWords(context)
        val system = listOf(instructions, AiTask.RULES, plan).filter { it.isNotEmpty() }.joinToString("\n\n")
        val turns = messages.map { m ->
            Content.Builder().role(if (m.role == "user") Content.Role.USER else Content.Role.MODEL).text(m.content).build()
        }
        val looking = app.getString(R.string.ai_looking_up)
        val heard = mutableListOf<AssistantSource>()
        send(AssistantLine.OnPhone)
        val words = Nano.converse(system, turns, tools.declarations, maxTokens = 400, onTool = { trySend(AssistantLine.Tool(it, looking)) }) { call ->
            tools.run(call).also { answer ->
                heard += AssistantSource("${call.name}-${heard.size}", label(call.name, call.arguments.values.joinToString(" ") { v -> AgentTools.plain(v).toString() }), AgentTools.json(answer).toString())
            }
        }
        val kept = FigureGuard.keep(words.orEmpty(), heard.map { it.text } + messages.map { it.content } + plan)
        if (kept.text.isBlank()) {
            send(AssistantLine.Problem(app.getString(R.string.ai_no_answer)))
            return@channelFlow
        }
        send(AssistantLine.Text(kept.text))
        if (heard.isNotEmpty()) send(AssistantLine.Sources(heard))
        send(AssistantLine.Done)
    }

    /** The plan and position as words the model reads, never computes from. */
    fun contextWords(c: AssistantContext?): String {
        if (c == null) return ""
        val lines = mutableListOf<String>()
        if (c.dep.isNotEmpty() && c.dest.isNotEmpty()) lines += "The route planned: ${(listOf(c.dep) + c.stops + c.dest).joinToString(" ")}."
        if (c.aircraft.isNotEmpty()) lines += "The airplane chosen: ${c.aircraft}." else lines += "No airplane is chosen; give no airplane figure."
        c.altitudeFt?.let { lines += "Cruise altitude: ${it.toLong()} ft." }
        c.ownShip?.let { lines += "The airplane is at ${"%.4f".format(it.lat)}, ${"%.4f".format(it.lon)}." }
        c.pilot?.homeBase?.let { lines += "The pilot's home field: $it." }
        return lines.joinToString(" ")
    }

    /** "Find airport KPAO" from findAirport and its arguments. */
    fun label(name: String, args: String): String {
        val words = name.replace(Regex("([a-z])([A-Z])"), "$1 $2").lowercase().replaceFirstChar { it.uppercase() }
        return listOf(words, args.trim()).filter { it.isNotEmpty() }.joinToString(" ")
    }

    private fun open(link: String) {
        val intent = Intent(Intent.ACTION_VIEW, link.toUri(), app, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        app.startActivity(intent)
    }
}
