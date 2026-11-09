package app.wingtipmaps.android.about

import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import androidx.compose.foundation.Image
import androidx.compose.foundation.clickable
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
import androidx.compose.material3.ListItem
import androidx.compose.material3.ListItemDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.core.net.toUri
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import app.wingtipmaps.android.Charts
import app.wingtipmaps.android.Config
import app.wingtipmaps.android.Plan
import app.wingtipmaps.android.R
import app.wingtipmaps.android.design.generated.WingtipRadius
import app.wingtipmaps.android.design.generated.WingtipSize
import app.wingtipmaps.android.design.generated.WingtipSpace
import app.wingtipmaps.android.ui.SectionTitle

/**
 * About, from the foot of Setup: the app and its build, the chart edition
 * and the cycle packs in use, the planning aid's words every app says
 * (docs/legal/credits.md), the credits, the privacy policy, terms and
 * support on the site, and the demo flight. A figure the phone does not
 * have is left out rather than guessed.
 *
 * @param onDemo after the demo flight is put on the plan: the sheets close
 *   back to the map, where it is drawn.
 */
@Composable
fun AboutScreen(onDemo: () -> Unit, model: AboutModel = viewModel(), charts: Charts = viewModel()) {
    val context = LocalContext.current
    val chart by charts.info.collectAsStateWithLifecycle()
    val packsCycle by model.packsCycle.collectAsStateWithLifecycle()
    // The activity's one plan, which the map draws.
    val plan: Plan = viewModel()

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
            Text(stringResource(R.string.app_name), style = MaterialTheme.typography.headlineSmall)
        }
        Figure(stringResource(R.string.about_version), model.version)
        Figure(stringResource(R.string.about_build), model.build.toString())
        chart?.chartCycle?.let { Figure(stringResource(R.string.about_chart_edition), it) }
        packsCycle?.let { Figure(stringResource(R.string.about_cycle_packs), it) }

        SectionTitle(stringResource(R.string.about_planning_aid))
        Text(stringResource(R.string.about_planning_aid_text), style = MaterialTheme.typography.bodyMedium)

        SectionTitle(stringResource(R.string.about_credits))
        AboutCredits.data.forEach { Credit(it) }
        AboutCredits.software.forEach { Credit(it) }

        SectionTitle(stringResource(R.string.about_legal))
        LegalRow(stringResource(R.string.about_privacy)) { openSite(context, "/privacy") }
        LegalRow(stringResource(R.string.about_terms)) { openSite(context, "/terms") }
        LegalRow(stringResource(R.string.about_support)) { openSite(context, "/support") }

        Button(
            onClick = {
                DemoFlight.fly(plan)
                onDemo()
            },
            modifier = Modifier.fillMaxWidth().padding(top = WingtipSpace.Lg),
        ) { Text(stringResource(R.string.about_demo_flight)) }
    }
}

/** A figure of the build or the data: its name, and its value at the end. */
@Composable
private fun Figure(name: String, value: String) {
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
        Text(name, style = MaterialTheme.typography.bodyLarge)
        Text(value, style = MaterialTheme.typography.bodyLarge, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

@Composable
private fun Credit(credit: AboutCredits.Credit) {
    Column(Modifier.fillMaxWidth()) {
        Text(credit.what, style = MaterialTheme.typography.bodyMedium)
        Text(credit.terms, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

/** A page of the site: the whole row the button, Material's list item. */
@Composable
private fun LegalRow(title: String, onOpen: () -> Unit) {
    ListItem(
        colors = ListItemDefaults.colors(containerColor = Color.Transparent),
        modifier = Modifier.fillMaxWidth().clickable(role = Role.Button, onClick = onOpen),
        content = { Text(title, color = MaterialTheme.colorScheme.primary) },
    )
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
