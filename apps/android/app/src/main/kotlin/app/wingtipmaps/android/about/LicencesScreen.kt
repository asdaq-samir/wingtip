package app.wingtipmaps.android.about

import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import app.wingtipmaps.android.R
import app.wingtipmaps.android.ui.WingtipIcons
import com.mikepenz.aboutlibraries.ui.compose.android.produceLibraries
import com.mikepenz.aboutlibraries.ui.compose.m3.LibrariesContainer

/**
 * The open-source licences of every library the app ships with, from About:
 * AboutLibraries' own Material 3 list, each library's licence a tap away,
 * read from what its Gradle plugin collected as the app was built
 * (R.raw.aboutlibraries; app/build.gradle.kts's `aboutLibraries`, which
 * fails the build on a licence not allowed), the engine's crates and
 * Inter's glyphs among them (app/aboutlibraries). A stock full-screen
 * Dialog, as the picture viewer is: Back and the close go back to About.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun LicencesScreen(onClose: () -> Unit) {
    Dialog(onDismissRequest = onClose, properties = DialogProperties(usePlatformDefaultWidth = false)) {
        val libraries by produceLibraries(R.raw.aboutlibraries)
        Scaffold(
            topBar = {
                TopAppBar(
                    title = { Text(stringResource(R.string.about_licences)) },
                    actions = {
                        IconButton(onClick = onClose) { Icon(WingtipIcons.close, contentDescription = stringResource(R.string.close)) }
                    },
                )
            },
        ) { padding ->
            LibrariesContainer(libraries, Modifier.fillMaxSize().padding(padding))
        }
    }
}
