package app.wingtipmaps.android.ui

import android.graphics.BitmapFactory
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.carousel.HorizontalMultiBrowseCarousel
import androidx.compose.material3.carousel.rememberCarouselState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import app.wingtipmaps.android.R
import app.wingtipmaps.android.api.Gateway
import app.wingtipmaps.android.api.picture
import app.wingtipmaps.android.design.generated.WingtipSpace
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

/** A picture on a card: what it is (TalkBack's words and the viewer's
 *  title), its address or gateway path, and its credit where it has one. */
data class CardPicture(val label: String, val address: String, val credit: String? = null)

/**
 * A card's pictures under its tabs, as Google Maps' place sheet has its
 * previews: Material's multi-browse carousel,
 * each picture a tap to the full-screen viewer, a stock Dialog, which
 * Back closes. A picture that cannot be had is left out.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PhotoCarousel(pictures: List<CardPicture>, modifier: Modifier = Modifier) {
    val loaded by produceState(emptyList<Pair<CardPicture, ImageBitmap>>(), pictures) {
        value = pictures.mapNotNull { p -> load(p.address)?.let { p to it } }
    }
    if (loaded.isEmpty()) return
    var open by remember { mutableStateOf<Pair<CardPicture, ImageBitmap>?>(null) }
    val state = rememberCarouselState { loaded.size }
    HorizontalMultiBrowseCarousel(
        state = state,
        preferredItemWidth = PictureWidth,
        itemSpacing = WingtipSpace.Sm,
        modifier = modifier.fillMaxWidth().height(PictureHeight).padding(horizontal = WingtipSpace.Lg),
    ) { i ->
        val (picture, bitmap) = loaded[i]
        Image(
            bitmap = bitmap,
            contentDescription = picture.label,
            contentScale = ContentScale.Crop,
            modifier = Modifier.fillMaxSize().maskClip(MaterialTheme.shapes.extraLarge)
                .clickable(role = Role.Image) { open = picture to bitmap },
        )
    }
    open?.let { (picture, bitmap) -> PictureViewer(picture, bitmap) { open = null } }
}

/** A picture's width in the carousel and the carousel's height: two
 *  and a peek across a phone, as Material's multi-browse sample. */
private val PictureWidth = 240.dp
private val PictureHeight = 180.dp

/** One picture at the whole screen, its credit under it; Back (the
 *  Dialog's own) and the close go back to the card. */
@Composable
private fun PictureViewer(picture: CardPicture, bitmap: ImageBitmap, onClose: () -> Unit) {
    Dialog(onDismissRequest = onClose, properties = DialogProperties(usePlatformDefaultWidth = false, decorFitsSystemWindows = false)) {
        Box(Modifier.fillMaxSize().background(Color.Black)) {
            Image(bitmap = bitmap, contentDescription = picture.label, contentScale = ContentScale.Fit, modifier = Modifier.fillMaxSize())
            IconButton(onClick = onClose, modifier = Modifier.align(Alignment.TopEnd).padding(WingtipSpace.Lg)) {
                Icon(WingtipIcons.close, contentDescription = stringResource(R.string.close), tint = Color.White)
            }
            picture.credit?.let {
                Text(it, color = Color.White, style = MaterialTheme.typography.bodySmall, modifier = Modifier.align(Alignment.BottomStart).padding(WingtipSpace.Lg))
            }
        }
    }
}

private suspend fun load(path: String): ImageBitmap? = try {
    Gateway.picture(path)?.let { bytes -> withContext(Dispatchers.Default) { BitmapFactory.decodeByteArray(bytes, 0, bytes.size)?.asImageBitmap() } }
} catch (e: CancellationException) {
    throw e
} catch (e: Exception) {
    null
}
