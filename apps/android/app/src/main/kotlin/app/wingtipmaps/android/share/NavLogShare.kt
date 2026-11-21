package app.wingtipmaps.android.share

import android.content.Context
import android.content.Intent
import android.print.PrintAttributes
import android.print.PrintManager
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.compose.foundation.layout.Box
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import app.wingtipmaps.android.Plan
import app.wingtipmaps.android.R
import app.wingtipmaps.android.strip.StripData
import app.wingtipmaps.android.ui.WingtipIcons

/**
 * The nav log card's Share, as the web's nav log Share holds the sharing
 * since the owner's ask of 2026-11-21 ("Print navlog should be in navlog
 * share, not in more"): the route's link, the nav log as text through
 * Android's sharesheet, and Print the Nav Log through Android's own print
 * framework (PrintManager, a WebView's print adapter, which offers every
 * printer and Save as PDF). Material's share button and its DropdownMenu.
 * The checkpoints for ForeFlight, the web's third, are not here:
 * ForeFlight has no Android app to take them.
 */
@Composable
fun NavLogShare(state: Plan.State) {
    val context = LocalContext.current
    var open by remember { mutableStateOf(false) }
    val link = rememberShareRoute(state)
    val route = StripData.routeName(state.dep, state.dest, state.stops)
    val sendTitle = stringResource(R.string.share_send)
    val printer = remember { NavLogPrint() }
    Box {
        IconButton(onClick = { open = true }) { Icon(WingtipIcons.share, contentDescription = stringResource(R.string.share)) }
        DropdownMenu(expanded = open, onDismissRequest = { open = false }) {
            DropdownMenuItem(
                text = { Text(stringResource(R.string.share_link)) },
                leadingIcon = { Icon(WingtipIcons.share, contentDescription = null) },
                onClick = {
                    open = false
                    link()
                },
            )
            DropdownMenuItem(
                text = { Text(stringResource(R.string.nav_log_text)) },
                leadingIcon = { Icon(WingtipIcons.navLog, contentDescription = null) },
                onClick = {
                    open = false
                    sendText(context, route, NavLogText.text(route, state.legs, state.totals), sendTitle)
                },
            )
            DropdownMenuItem(
                text = { Text(stringResource(R.string.nav_log_print)) },
                leadingIcon = { Icon(WingtipIcons.print, contentDescription = null) },
                onClick = {
                    open = false
                    printer.print(context, route, NavLogText.html(route, state.legs, state.totals))
                },
            )
        }
    }
}

private fun sendText(context: Context, subject: String, text: String, title: String) {
    val send = Intent(Intent.ACTION_SEND).apply {
        type = "text/plain"
        putExtra(Intent.EXTRA_SUBJECT, subject)
        putExtra(Intent.EXTRA_TEXT, text)
    }
    context.startActivity(Intent.createChooser(send, title))
}

/**
 * Printing the nav log, Android's documented way to print HTML: a
 * WebView not shown, loaded with the page, handed to PrintManager once
 * loaded. The WebView is held until then, as the guide says, so it is
 * not collected before the page is laid out; by the screen's own
 * remembered printer, never a static field.
 */
class NavLogPrint {
    private var loading: WebView? = null

    fun print(context: Context, jobName: String, html: String) {
        val view = WebView(context)
        view.webViewClient = object : WebViewClient() {
            override fun onPageFinished(page: WebView, url: String?) {
                val printer = context.getSystemService(Context.PRINT_SERVICE) as PrintManager
                printer.print(jobName, page.createPrintDocumentAdapter(jobName), PrintAttributes.Builder().build())
                loading = null
            }
        }
        view.loadDataWithBaseURL(null, html, "text/html", "UTF-8", null)
        loading = view
    }
}
