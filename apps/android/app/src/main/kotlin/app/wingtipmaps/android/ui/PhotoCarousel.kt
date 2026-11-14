package app.wingtipmaps.android.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Spacer
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
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import app.wingtipmaps.android.Config
import app.wingtipmaps.android.R
import app.wingtipmaps.android.design.generated.WingtipSpace
import coil3.SingletonImageLoader
import coil3.compose.AsyncImage
import coil3.compose.LocalPlatformContext
import coil3.request.ImageRequest
import coil3.request.SuccessResult
import me.saket.telephoto.zoomable.coil3.ZoomableAsyncImage

/** A picture on a card: what it is (TalkBack's words and the viewer's
 *  title), its address or gateway path, and its credit where it has one.
 *  A tap opens it in the full-screen viewer, or its source's page where
 *  `link` is given (Planespotters', as their terms ask); a `drawn` tile is
 *  drawn by the card (a flight's path sketch), with no address to load. */
data class CardPicture(
    val label: String,
    val address: String,
    val credit: String? = null,
    val link: String? = null,
    val drawn: (@Composable () -> Unit)? = null,
)

/**
 * A card's pictures under its facts and over its pages (C1, the owner,
 * 2026-11-14, after Apple Maps' place card; the web's CardPictures):
 * Material's multi-browse carousel of large rounded tiles, the next one
 * showing past the edge, each a tap to the full-screen viewer, a stock
 * Dialog with pinch and double-tap zoom, which Back closes, or to its
 * source's page. A picture that cannot be had is left out. The strip is
 * one height whatever it holds, its room kept while the pictures are
 * asked for, so nothing under it moves as they arrive (the web's
 * c43f268a7). Coil loads them (the app's one loader, on the app's OkHttp
 * client): asked once here to learn which can be had, then drawn from its
 * memory cache.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PhotoCarousel(pictures: List<CardPicture>, modifier: Modifier = Modifier) {
    val context = LocalPlatformContext.current
    // Asked by their addresses, so a card drawn again (a drawn tile's new
    // lambda) does not ask again; the tiles drawn are the card's latest.
    val addresses = pictures.filter { it.drawn == null }.map { it.address }
    val had by produceState<Set<String>?>(null, addresses) {
        val loader = SingletonImageLoader.get(context)
        value = addresses.filter { a -> loader.execute(ImageRequest.Builder(context).data(address(a)).build()) is SuccessResult }.toSet()
    }
    val asked = had
    if (asked == null) {
        // The strip's room held while its pictures are asked for.
        if (pictures.isNotEmpty()) Spacer(modifier.fillMaxWidth().height(PictureHeight))
        return
    }
    val loaded = pictures.filter { it.drawn != null || it.address in asked }
    if (loaded.isEmpty()) return
    val uri = LocalUriHandler.current
    var open by remember { mutableStateOf<CardPicture?>(null) }
    val state = rememberCarouselState { loaded.size }
    HorizontalMultiBrowseCarousel(
        state = state,
        preferredItemWidth = PictureWidth,
        itemSpacing = WingtipSpace.Sm,
        modifier = modifier.fillMaxWidth().height(PictureHeight).padding(horizontal = WingtipSpace.Lg),
    ) { i ->
        val picture = loaded[i]
        val tile = Modifier.fillMaxSize().maskClip(MaterialTheme.shapes.extraLarge)
        val drawn = picture.drawn
        when {
            drawn != null -> Box(tile.background(MaterialTheme.colorScheme.surfaceContainerHigh).semantics { contentDescription = picture.label }) { drawn() }
            else -> Box(tile.clickable(role = Role.Image, onClickLabel = picture.label) { picture.link?.let(uri::openUri) ?: run { open = picture } }) {
                AsyncImage(model = address(picture.address), contentDescription = picture.label, contentScale = ContentScale.Crop, modifier = Modifier.fillMaxSize())
                // A linked photo's credit on it, as Planespotters' terms ask.
                if (picture.link != null) {
                    picture.credit?.let {
                        Text(
                            it, color = Color.White, style = MaterialTheme.typography.labelSmall,
                            modifier = Modifier.align(Alignment.BottomStart).background(Color.Black.copy(alpha = CREDIT_SHADE)).padding(horizontal = WingtipSpace.Sm, vertical = WingtipSpace.Xxs),
                        )
                    }
                }
            }
        }
    }
    open?.let { picture -> PictureViewer(picture) { open = null } }
}

/** A picture's width in the carousel and the carousel's height: two
 *  and a peek across a phone, as Material's multi-browse sample. */
private val PictureWidth = 240.dp
private val PictureHeight = 180.dp

/** The shade under a credit written on a picture, so white words read on any photo. */
private const val CREDIT_SHADE = 0.55f

/** A picture's address, or the gateway path the planner gave
 *  ("/api/planner/airport-aerial/KOSH.jpg") on the gateway. */
private fun address(path: String): String = if (path.startsWith("/")) Config.gateway + path else path

/** One picture at the whole screen, its credit under it, pinched and
 *  double-tapped to zoom (telephoto's ZoomableAsyncImage); Back (the
 *  Dialog's own) and the close go back to the card. */
@Composable
private fun PictureViewer(picture: CardPicture, onClose: () -> Unit) {
    Dialog(onDismissRequest = onClose, properties = DialogProperties(usePlatformDefaultWidth = false, decorFitsSystemWindows = false)) {
        Box(Modifier.fillMaxSize().background(Color.Black)) {
            ZoomableAsyncImage(model = address(picture.address), contentDescription = picture.label, contentScale = ContentScale.Fit, modifier = Modifier.fillMaxSize())
            IconButton(onClick = onClose, modifier = Modifier.align(Alignment.TopEnd).padding(WingtipSpace.Lg)) {
                Icon(WingtipIcons.close, contentDescription = stringResource(R.string.close), tint = Color.White)
            }
            picture.credit?.let {
                Text(it, color = Color.White, style = MaterialTheme.typography.bodySmall, modifier = Modifier.align(Alignment.BottomStart).padding(WingtipSpace.Lg))
            }
        }
    }
}
