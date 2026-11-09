package app.wingtipmaps.android.documents

import android.app.Activity
import android.content.Context
import android.content.ContextWrapper
import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.IntentSenderRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.ui.platform.LocalContext
import com.google.mlkit.vision.documentscanner.GmsDocumentScannerOptions
import com.google.mlkit.vision.documentscanner.GmsDocumentScanning
import com.google.mlkit.vision.documentscanner.GmsDocumentScanningResult

/**
 * Google's document scanner (ML Kit, through Play services): the
 * system's own screen that finds the page's edges, flattens it and lets
 * the pilot crop or pick a photo already taken, as the iPhone's
 * VisionKit scanner does. One page, as a JPEG; the app never asks for the
 * camera itself. Returns the tap that opens it; `onPage` gets the page,
 * `onProblem` why the scanner could not open.
 */
@Composable
fun rememberPageScanner(onPage: (Uri) -> Unit, onProblem: (String) -> Unit): () -> Unit {
    val context = LocalContext.current
    val page by rememberUpdatedState(onPage)
    val problem by rememberUpdatedState(onProblem)
    val launcher = rememberLauncherForActivityResult(ActivityResultContracts.StartIntentSenderForResult()) { result ->
        // Given up in the scanner: nothing to read, nothing said.
        if (result.resultCode != Activity.RESULT_OK) return@rememberLauncherForActivityResult
        GmsDocumentScanningResult.fromActivityResultIntent(result.data)?.pages?.firstOrNull()?.imageUri?.let(page)
    }
    return remember(context) {
        {
            val activity = context.activity()
            if (activity == null) {
                problem("The scanner could not open here.")
            } else {
                val options = GmsDocumentScannerOptions.Builder()
                    .setGalleryImportAllowed(true)
                    .setPageLimit(1)
                    .setResultFormats(GmsDocumentScannerOptions.RESULT_FORMAT_JPEG)
                    .setScannerMode(GmsDocumentScannerOptions.SCANNER_MODE_FULL)
                    .build()
                GmsDocumentScanning.getClient(options).getStartScanIntent(activity)
                    .addOnSuccessListener { launcher.launch(IntentSenderRequest.Builder(it).build()) }
                    .addOnFailureListener { problem("The scanner could not open: ${it.message}") }
            }
        }
    }
}

private tailrec fun Context.activity(): Activity? = when (this) {
    is Activity -> this
    is ContextWrapper -> baseContext.activity()
    else -> null
}
