import updatesWeek38Image from "@/images/updates-week-38-2025.webp"
import updatesWeek39Image from "@/images/updates-week-39-2025.webp"
import updatesWeek40Image from "@/images/updates-week-40-2025.webp"
import updatesWeek44Image from "@/images/updates-week-44-2025.webp"
import detectDisposableEmailAddressesMxRecordsImage from "@/images/detect-disposable-email-addresses-mx-records.webp"

const blogImages = {
	"detect-disposable-email-addresses-mx-records.webp": detectDisposableEmailAddressesMxRecordsImage,
	"updates-week-38-2025.webp": updatesWeek38Image,
	"updates-week-39-2025.webp": updatesWeek39Image,
	"updates-week-40-2025.webp": updatesWeek40Image,
	"updates-week-44-2025.webp": updatesWeek44Image,
}

export function getBlogImage(post) {
	if(/^https?:\/\//i.test(post.imageUrl || "")) {
		return {
			src: post.imageUrl,
			width: post.imageWidth || 1672,
			height: post.imageHeight || 941,
		}
	}

	return blogImages[post.imageUrl] || blogImages[`${post.slug}.webp`] || null
}
