package app.wingtipmaps.android.about

import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.os.Build
import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.core.net.toUri
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.wingtipmaps.android.Charts
import app.wingtipmaps.android.Config
import app.wingtipmaps.android.Plan
import app.wingtipmaps.android.R
import app.wingtipmaps.android.design.generated.WingtipRadius
import app.wingtipmaps.android.design.generated.WingtipSize
import app.wingtipmaps.android.design.generated.WingtipSpace
import app.wingtipmaps.android.ui.ActionSettingRow
import app.wingtipmaps.android.ui.SectionTitle
import app.wingtipmaps.android.ui.SettingsGroup
import app.wingtipmaps.android.ui.ValueSettingRow

/**
 * About, from the foot of Setup: the app and its build, the chart edition
 * and the cycle packs in use, the planning aid's words every app says
 * (docs/legal/credits.md), the credits, the privacy policy, terms and
 * support on the site, Send Feedback, the open-source licences
 * (LicencesScreen), and the demo flight. A figure the phone does not
 * have is left out rather than guessed.
 *
 * @param onDemo after the demo flight is put on the plan: the sheets close
 *   back to the map, where it is drawn.
 */
@Composable
fun AboutScreen(onDemo: () -> Unit, model: AboutModel = hiltViewModel(), charts: Charts = hiltViewModel()) {
    val context = LocalContext.current
    val chart by charts.info.collectAsStateWithLifecycle()
    val packsCycle by model.packsCycle.collectAsStateWithLifecycle()
    // The activity's one plan, which the map draws.
    val plan: Plan = hiltViewModel()
    var licences by rememberSaveable { mutableStateOf(false) }

    Column(
        Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(horizontal = WingtipSpace.Lg).padding(bottom = WingtipSpace.Xl),
        verticalArrangement = Arrangement.spacedBy(WingtipSpace.Sm),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(WingtipSpace.Md)) {
            // The launcher's mark: its two layers, the mark on the piece of sectional.
            Box(Modifier.size(WingtipSize.TapTarget + WingtipSpace.Lg).clip(RoundedCornerShape(WingtipRadius.Base))) {
                Image(painterResource(R.mipmap.ic_launcher_background), contentDescription = null, modifier = Modifier.matchParentSize())
                Image(painterResource(R.mipmap.ic_launcher_foreground), contentDescription = null, modifier = Modifier.matchParentSize())
            }
            Text(stringResource(R.string.app_name), style = MaterialTheme.typography.headlineSmallEmphasized)
        }
        // The build and the data in use, one segmented group; a figure the
        // phone does not have is left out, so the group counts what it has.
        val figures = listOfNotNull(
            stringResource(R.string.about_version) to model.version,
            stringResource(R.string.about_build) to model.build.toString(),
            chart?.chartCycle?.let { stringResource(R.string.about_chart_edition) to it },
            packsCycle?.let { stringResource(R.string.about_cycle_packs) to it },
        )
        SettingsGroup {
            figures.forEachIndexed { i, (name, value) -> ValueSettingRow(name, value, index = i, count = figures.size) }
        }

        SectionTitle(stringResource(R.string.wording_planning_aid_title))
        Text(stringResource(R.string.wording_planning_aid), style = MaterialTheme.typography.bodyMedium)

        SectionTitle(stringResource(R.string.about_credits))
        AboutCredits.data.forEach { Credit(it) }
        AboutCredits.software.forEach { Credit(it) }

        SectionTitle(stringResource(R.string.about_legal))
        SettingsGroup {
            ActionSettingRow(stringResource(R.string.about_privacy), index = 0, count = 4) { openSite(context, "/privacy") }
            ActionSettingRow(stringResource(R.string.about_terms), index = 1, count = 4) { openSite(context, "/terms") }
            ActionSettingRow(stringResource(R.string.about_support), index = 2, count = 4) { openSite(context, "/support") }
            // The open-source licences of every library the app ships with.
            ActionSettingRow(stringResource(R.string.about_licences), index = 3, count = 4) { licences = true }
        }
        if (licences) LicencesScreen { licences = false }
        // A tester's word to the owner, through Android's sharesheet to
        // whoever they send it (docs/store/beta.md): the build and the
        // system, which the fault reports already carry, and three
        // questions; the app itself sends nothing.
        val feedback = stringResource(R.string.about_feedback_text, model.version, model.build, Build.VERSION.RELEASE)
        val subject = stringResource(R.string.about_feedback_subject)
        SettingsGroup {
            ActionSettingRow(stringResource(R.string.about_send_feedback), index = 0, count = 1) { sendFeedback(context, subject, feedback) }
        }

        Button(
            onClick = {
                DemoFlight.fly(plan)
                onDemo()
            },
            modifier = Modifier.fillMaxWidth().padding(top = WingtipSpace.Lg),
        ) { Text(stringResource(R.string.about_demo_flight)) }
    }
}

@Composable
private fun Credit(credit: AboutCredits.Credit) {
    Column(Modifier.fillMaxWidth()) {
        Text(credit.what, style = MaterialTheme.typography.bodyMedium)
        Text(credit.terms, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

/** The feedback in Android's sharesheet, for the tester's mail or messages. */
private fun sendFeedback(context: Context, subject: String, text: String) {
    val send = Intent(Intent.ACTION_SEND).setType("text/plain").putExtra(Intent.EXTRA_SUBJECT, subject).putExtra(Intent.EXTRA_TEXT, text)
    context.startActivity(Intent.createChooser(send, null))
}

/** The site's page in the phone's browser: the policy and terms are the
 *  site's, kept in one place for the stores' listings and every app. */
private fun openSite(context: Context, path: String) {
    try {
        context.startActivity(Intent(Intent.ACTION_VIEW, "https://${Config.host}$path".toUri()))
    } catch (_: ActivityNotFoundException) {
        // No browser on the phone: nothing to open it in.
    }
}
