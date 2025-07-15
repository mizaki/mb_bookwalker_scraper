import { string_to_date } from './date.js'
//import { Logger } from '$lib/logger'
//import SeriesNews from '$lib/server/models/SeriesNews.model'
import { BookWalkerGlobalMangaBakaSeries } from './bw.types.js'
import axios from 'axios'
import * as cheerio from 'cheerio'
//import tracer, { type TraceOptions } from 'dd-trace'
//import { kinds } from 'dd-trace/ext'
//import tags from 'dd-trace/ext/tags'
import type { Job } from 'pg-boss'
import { ja, no, tr } from 'zod/v4/locales'
import { AnyNode } from 'domhandler'
//import parser from 'xml2json'
//import SourceAnimeNewsNetwork from '../models/SourceAnimeNewsNetwork.model'
//import { Queue, QueueClient } from '../queue'
/*
// Define a simple delay function
const delay = (ms: number) => new Promise(res => setTimeout(res, ms))

async function processReleasesWithRateLimit(data: any) {
  const releases = data['releases']
  const results: any[] = [] // To store the results of each promise

  // Use reduce to sequentially build and execute the promises
  await releases.reduce(async (previousPromise: Promise<any>, release: any) => {
    // Wait for the previous promise to complete
    await previousPromise

    // Execute the current fetch
    const result = await bwg_fetch_release(data['title'], release['link']);
    results.push(result) // Store the result

    // Wait for 1 second before the next iteration can begin
    return delay(1000) // 1000ms = 1 second
  }, Promise.resolve()) // Initial promise that resolves immediately

  data['volumes_full'] = results
}

export function extract_volume_info($: cheerio.CheerioAPI, series_title: string) {
	function extract_next_text(ele: any, ean: boolean = false): string | null {
		if (ele.length == 1) {
			// Find ISBN11, ISBN12 and SKU
			if (ean) {
				return ele.next().text().trim()
			}
			// Next will be Text and not an "element"
			return ele.get(0)?.next?.data.trim()
		}
		return null
	}

	function extract_dist(ele: any) {
		if (ele.length == 1) {
			data['distributor'] = {'name': null, 'link': null, 'id': 0}
			data['distributor']['name'] = ele?.next()?.text()
			const link = ele.next()?.attr('href')
			if (link) {
				data['distributor']['link'] = 'https://www.animenewsnetwork.com/encyclopedia/' + link
			}
			if (data['distributor']['link']) {
				const v_id = data['distributor']['link'].split('?id=')
				if (v_id.length == 2) {
					data['distributor']['id'] = Number(v_id[1])
				}
			}
		} else {
			data['distributor'] = null
		}
	}

	function parse_title(ele: string | null) {
		data['title'] = null
		data['edition'] = null
		if (ele === null) {
			return
		}

		// TODO filter out DVD? https://www.animenewsnetwork.com/encyclopedia/releases.php?id=9157
		// Sometimes (quite often) the title will have the series title, so remove it
		ele = ele.replace(series_title, '')
		// Also, can have things like "[Onmibus]", "[Hardcover]" or "Box Set", consider them "edition"
		data['edition'] = /\[([\w\s]*)\]|Box Set/i.exec(ele)?.[1]?.trim() || null
		if (data['edition']) {
			ele = ele.replace(/\[[\w\s]*\]|Box Set/i, '')
		}
		// Rest should be title
		data['title'] = /\W*(.*)/.exec(ele)?.[1]?.trim() || null

	}

	function parse_writer_artist(desc_text: string) {
		// Should this be pre-filled from main page info?
		// Don't capture ", Original Concept by" name and by extension anything after a comma that's not "art"
		if (desc_text) {
			let both = /story and art by (.*?)\W?$/gmi.exec(desc_text)
			if (both === null) {
				for (const match of desc_text.matchAll(/(?<role>story|art)\sby\s(?<name>[a-zA-Z ]*?)(?=\sand\s(?:art|story)|\.$|$)/gmi)) {
					if (match?.groups?.role.toLowerCase() == 'art') {
						data['artist'] = match.groups.name
					} else if (match?.groups?.role.toLowerCase() == 'story') {
						data['writer'] = match.groups.name
					}
				}
			} else {
				data['artist'] = both && both[1] ? both[1] : ''
				data['writer'] = both && both[1] ? both[1] : ''
			}
		}
	}

	function parse_desc(ele: any) {
		// Text can be within the same parent <p> as "Description:" or can be next <div> down
		const next_desc = ele.parent()?.next()

		if (next_desc && next_desc?.[0]?.name == 'div') {
			data['description'] = next_desc.text()
			
		} else {
			// Remove "Description:" from within the <p>
			if (ele.first() == '<b>Description:</b>') {
				ele.empty()
			}
			data['description'] = ele?.parent()?.text()?.trim()
		}
		data['description'] = data['description'].replace(/^\n\n/, '')
		parse_writer_artist(data['description'])
	}
	
	function parse_add_modified(ele: any) {
		const add_mod_match = /^\(added\son\s(?<added>\d{4}-\d{2}-\d{2})(?:,\smodified\son\s(?<modified>\d{4}-\d{2}-\d{2}))?/.exec(ele?.text())
		if (add_mod_match && add_mod_match.groups) {
			data['added'] = add_mod_match.groups.added ? string_to_date(add_mod_match.groups.added).toJSDate() : null
			data['modified'] = add_mod_match.groups.modified ? string_to_date(add_mod_match.groups.modified).toJSDate() : null
		}
	}

	function parse_vol_num(vol_num: string | null) {
		if (vol_num == null) {
			data['volume'] = null
		} else {
			// Types: "eBook 1 / 27", "GN 1 / 27", "Novel 1", "Fanbook", "Artbook 1", "GN 1-3", "GN"
			const volumeMatch = vol_num.match(/^([a-zA-Z]*)?(?:\s)?(\d+-\d+|\d+)?/)
			// Presume 1 if missing
			data['volume'] = volumeMatch && volumeMatch[2] ? volumeMatch[2] : '1'

			switch (volumeMatch?.[1].trim().toLowerCase()) {
				case 'gn':
					data['type'] = 'Graphic Novel'
					break
				case 'novel':
					data['type'] = 'Novel'
					break
				case 'ebook':
					data['type'] = 'eBook'
					break
				case 'artbook':
					data['type'] = 'Artbook'
					break
				default:
					data['type'] = 'Other/Unknown'
			}
		}
	}

	const data: Record<string, any> = {}
	parse_title(extract_next_text($('b:contains("Title:"):first')))
	data['date'] = string_to_date(extract_next_text($('b:contains("Release date:"):first'))).toJSDate()
	data['price'] = extract_next_text($('b:contains("Suggested retail price:"):first'))
	data['maturity_rating'] = extract_next_text($('b:contains("Age rating:"):first'))
	data['isbn10'] = extract_next_text($('b:contains("ISBN-10:"):first'), true)
	data['isbn13'] = extract_next_text($('b:contains("ISBN-13:"):first'), true)
	data['sku'] = extract_next_text($('b:contains("SKU:"):first'), true)
	data['pages'] = extract_next_text($('b:contains("Running time:"):first')) // eBook uses this for pages
	if (data['pages'] == null) {
		data['pages'] = extract_next_text($('b:contains("Pages:"):first'))
	}
	data['pages'] = data['pages'] ? Number(data['pages']) : 0
	extract_dist($('b:contains("Distributor:"):first'))
	parse_vol_num(extract_next_text($('b:contains("Volume:"):first')))
	parse_desc($('b:contains("Description:"):first'))
	parse_add_modified($('small:contains("added"):first'))

	return data
}

export function bwg_parse_release($: cheerio.CheerioAPI, vol_id: number, series_title: string) {
	// Remove A-Z navigation links
	$('center').remove()
	// Main data collection done here
	const data = extract_volume_info($, series_title)

	data['id'] = vol_id

	const img = $('#content-zone div > img').eq(0).attr('src')

	if (typeof img === 'undefined') {
		data['cover'] = null
	} else {
		data['cover'] = 'https:' + img
	}

  return data
}

export async function bwg_fetch_release(title: string, url: string) {
	try {
			const response = await axios.get(url, {
					// Don't accept redirects for the specific ANN behaviour
					maxRedirects: 0,
			})

			if (response.status !== 200) {
					throw new Error(`Failed to retrieve the web page - got response code [${response.status}] for URL [${url}]`);
			}

			// Extract ID from URL
			const id_param = url.split('?id=')[1]
			const id = id_param ? parseInt(id_param) : NaN

			if (isNaN(id)) {
					throw new Error('Could not extract a valid volume ID from the URL. Ensure the URL contains "?id=..."');
			}
			// Pass in Volumes titles for naming?
			return mb_parse_release(cheerio.load(response.data), id, title)
	} catch (error: any) {
			console.error('An error occurred during parsing:');
			if (error.response) {
					console.error(`Status: ${error.response.status}`);
					console.error(`Data: ${JSON.stringify(error.response.data, null, 2)}`);
			} else if (error instanceof Error) {
					console.error(`Error: ${error.message}`);
			} else {
					console.error(error); // Fallback for unexpected error types
			}
			process.exit(1);
	}
}

export async function bwg_fetch_chapters(url: string) {
	try {
			const response = await axios.get(url, {
					// Don't accept redirects for the specific ANN behaviour
					maxRedirects: 0,
			})

			if (response.status !== 200) {
					throw new Error(`Failed to retrieve the web page - got response code [${response.status}] for URL [${url}]`);
			}

			return mb_parse_chapters(cheerio.load(response.data), url)

	} catch (error: any) {
			console.error('An error occurred during parsing:' + url);
			if (error.response) {
					console.error(`Status: ${error.response.status}`);
					console.error(`Data: ${JSON.stringify(error.response.data, null, 2)}`);
			} else if (error instanceof Error) {
					console.error(`Error: ${error.message}`);
			} else {
					console.error(error); // Fallback for unexpected error types
			}
			process.exit(1);
	}
}

export function bwg_parse_chapters($: cheerio.CheerioAPI, url: string) {
	const chapters: Record<string, any>[] = []
	const next_page = $('#infotype-34 p:first a')
	let next_page_url = ''
	
	// There is no "next" for chapters pages, so this mess
	const current_url = new URL(url)
	if (next_page.length === 1 || !current_url.searchParams.get('subpage')) {
		next_page_url = url + '&subpage=1'
	} else {
		// Use current url if next_page fails
		const next_url = new URL(next_page?.last()?.attr('href') || url, url)
		const current_page_num = Number(current_url.searchParams.get('subpage') || 0)
		const next_page_num = Number(next_url.searchParams.get('subpage') || 0)
		if (next_page_num > current_page_num) {
			next_page_url = next_url.href
		}
	}
	
	const table = $('table.episode-list tbody tr')
	table.each((index, tbl_row) => {
		const chapter_info: Record<string, any> = {
			number: null,
			sub_number: null,
			title: null,
			title_ja: null,
			title_ja_en: null,
			comment: null,
		}
		for (const td of tbl_row.children) {
			const $td = $(td)
			if (td.type == 'tag' && td.attributes.length > 0) {
				let class_name = $td.attr('class')
				if (!class_name) {
					class_name = $td.attr('valign')
				}
				switch (class_name) {
					case 'd':
						chapter_info['date'] = string_to_date($td.text().trim()).toJSDate()
						break
					case 'n':
						chapter_info['number'] = parseInt($td.text().trim())
						break
					case 'pn':
						chapter_info['sub_number'] = $td.text().trim() ? parseInt($td.text().trim()) : null
						break
					case 'top':
						// <valign: top> contains English title and can contain <div class='j'> with sub divs (unnamed) for romanji and Japanese
						chapter_info['title'] = $td.children()?.first()?.text()?.trim()

						// Go hunting titles and comments
						const j_text = $td.find('.j')?.text().replace(/[\n\t]/g, '').trim()
						const comment = $td.find('.r')?.text().replace(/[\n\t]/g, '').trim()

						if (j_text) {
							const ja_text_split = j_text.split('  ')
							for (const ja_text of ja_text_split) {
								// Because romaji can be either first or second we have to test
								//const romaji_text = ja_text.replace(/[^\p{Script=Latin}\p{N}\s!',:;’\.\-—\?]+/gu, '')
								const non_romaji_text = ja_text.replace(/[\p{Script=Latin}\p{N}\s!',:;’\.\-—\?]+/gu, '')

								// Whichever we have more of (Latin or non-Latin) wins the definition
								if (non_romaji_text.length > 0) {
									chapter_info['title_ja'] = ja_text.trim()
								} else {
									chapter_info['title_ja_en'] = ja_text.trim()
								}
							}
						}
						if (comment) {
							chapter_info['comment'] = comment.replaceAll('  ', '\n')
						}
						break
				}
			}
		}
		chapters.push(chapter_info)
	})
	return {chapters: chapters, next_page: next_page_url}
}
*/
export async function bwg_parse_page($: cheerio.CheerioAPI, id: string, isVolume: boolean = true) {
	function gen_staff(staff_info: any) {
		const staffs: Record<string, any>[] = []
		staff_info.children('td').children('a').each((idx: number, staff: any) => {
			const $staff = $(staff)
			const staff_name = $staff.text().trim()
			const staff_href = $staff.attr('href')
			const staff_id = staff_href ? /\d+/.exec(staff_href)?.[0] : null
			if (staff_id) {
				staffs.push({
					'id': Number(staff_id),
					'name': staff_name,
					'link': staff_href,
				})
			}
			})
		if (staffs.length > 0) {
			return staffs
		} else {
			return null
		}
	}

	const series_data: Record<string, any> = {}
	const series_title_url = $('ul.bread-crumb a[href*="series"]')
	const series_title_text = series_title_url.text()
	const series_id_url = series_title_url.attr('href')
	if (series_id_url) {
		const series_id = /\d+/.exec(series_id_url)
		series_data['series_id'] = series_id && series_id[0] ? Number(series_id[0]) : null
	}
	// Series title and type
	// Use the title info from the top of the page for type
	const series_title_top_text = $('.detail-book-title').text().trim()
	const series_type_match = /light novel|manga|art book/i.exec(series_title_top_text)
	series_data['type'] = series_type_match && series_type_match[0] ? series_type_match[0].toLowerCase() : null
	// The demon regex and I don't have a licence!
	const series_title_main = /^(?:<[^>]*>\s*)?(?<title>.*?)(?:\s*(?:\(.*\)|（.*）|chapter.*|manga.*))?$/ig.exec(series_title_text)
	if (series_title_main && series_title_main.groups) {
		series_data['series_title'] = series_title_main.groups.title
	}
	/*if (isVolume) {
		let series_title_match = null
		if (series_data['type'] == 'art book' || series_data['type'] == 'light novel') {
			series_title_match = /(.*)\s-\s[art book|light novels]/i.exec(series_title_top_text)
		} else {
			series_title_match = /(.*)\svol.*?\d+/i.exec(series_title_top_text)
		}
		series_data['series_title'] = series_title_match && series_title_match[1] ? series_title_match[1] : null
	} else {
		const series_title_match = /(.*)\schapter\s\d+/i.exec(series_title_top_text)
		series_data['series_title'] = series_title_match && series_title_match[1] ? series_title_match[1] : null
	}*/

	const data: Record<string, any> = {}
	data['id'] = id
	data['cover'] = $('div.book-img img').attr('src') // Need to hash to check for "Now printing"?
	data['genres'] = []
	data['writer'] = []
	data['artist'] = []
	data['design'] = []
	data['letterer'] = []
	data['translator'] = []
	data['compiled'] = []

	const product_detail = $('table.product-detail tbody')

	product_detail.children().each((index, detail) => {
		const $detail = $(detail)
		switch ($detail.children('th').text()) {
			case 'Alternative Title' :
				series_data['series_alt_title'] =  $detail.children('td').text().trim()
				break
			case 'Japanese Title' :
				const ja_title = $detail.children('td').text().trim().replace('\n', '').split('(')
				series_data['series_title_ja'] = ja_title[0] ? ja_title[0].trim() : null
				series_data['series_title_ja_en'] =  ja_title[1] ? ja_title[1].slice(0, -1) : null
				break
			case 'Author':
			case 'By (author)':
			case 'Writer':
			case 'Story':
			case 'Original Work':
				data['writer'] = gen_staff($detail)
				break
			case 'Artist':
			case 'Art':
			case 'By (artist)':
			case 'Illustrated by':
				data['artist'] = gen_staff($detail)
				break
			case 'Designed by':
			case 'Character Design':
				data['design'] = gen_staff($detail)
				break
			case 'Letterer':
				data['letterer'] = gen_staff($detail)
				break
			case 'Translated by':
				data['translator'] = gen_staff($detail)
				break
			case 'Compiled by':
				data['compiled'] = gen_staff($detail)
				break
			case 'Publisher':
				const pub_name = $detail.children('td').text().trim()
				const pub_link = $detail.children('td').find('a').attr('href')
				const pub_id = pub_link ? /\d+/.exec(pub_link) : null
				data['distributor'] = {'name': null, 'link': null, 'id': null}
				data['distributor']['name'] = pub_name
				data['distributor']['link'] = pub_link
				data['distributor']['id'] = pub_id ? Number(pub_id) : null
				break
			case 'Genre':
				const genres: string[] = $detail.children('td').text().trim().replace(/\s\s/g, '').split(',')
				for (let g of genres) {
					g = g.trim()
					if (!(g == 'Manga' || g == 'Light Novels' || g.endsWith('coupon'))) {
						data['genres'].push(g)
						if (g == 'Mature') {
							data['maturity_rating'] = 'Mature'
						}
						if (!isVolume && g == 'V-Scroll Comics') {
							data['vscroll'] = true
						}
					}
				}
				break
			case 'Available since':
				const dates = $detail.children('td').text().trim().split('/')
				data['date'] = string_to_date(dates[0].split('(')[0].trim())
				break
			case 'Page count':
				const pages_string = $detail.children('td').text().trim().split('pages')
				if (pages_string[0]) {
					const pages = Number(pages_string[0])
					data['pages'] = pages > 1 ? pages : null
				}
				break
			case 'Chapters included in this volume':
				const chap_list = $detail.children('td').text().trim()
				data['chapters'] = [...chap_list.matchAll(/\d+\.\d+|\d+/gm)].map(match => match[0])
				break
		}
	})

	data['description'] = $('p.synopsis-text').text().trim()
	
	if (isVolume) {
		const series_title_top_text_match = series_title_top_text.match(/.*\svol.*?\s(\d+)|(\d+)/i)
		// Volume format can be "Volume n" or "Vol. n" or just a number
		if (series_title_top_text_match && series_title_top_text_match[1]) {
			data['volume'] = series_title_top_text_match[1]
		} else if (series_title_top_text_match && series_title_top_text_match[2]) {
			data['volume'] = series_title_top_text_match[2]
		} else {
			data['volume'] = 1 // default to 1
		}

		// Volume possible title
		// TODO Use already grabbed series title to reduce string
		const series_title_top_text_split = series_title_top_text[0].split(' - ')
		data['title'] = series_title_top_text_split[1] ? series_title_top_text_split[1] : null
	} else {
		const series_title_top_text_match = series_title_top_text.match(/.*\schapter\s(\d+\.\d+|\d+)/i)
		if (series_title_top_text_match && series_title_top_text_match[1]) {
			data['chapter'] = series_title_top_text_match[1]
		} else if (series_title_top_text_match && series_title_top_text_match[2]) {
			data['chapter'] = series_title_top_text_match[2]
		} else {
			data['chapter'] = 1 // default to 1
		}

		// Chapter possible title
		const series_title_top_text_chapter = /chapter\s\d+(?:\.\d+)?:\s(.*)\s-/i.exec(series_title_top_text)
		data['title'] = series_title_top_text_chapter && series_title_top_text_chapter[1] ? series_title_top_text_chapter[1] : null
	}
	

	const price = $('.detail-price').text().trim()
	const price_dollar = price? /\d+\.\d+|\d+/.exec(price) : null
	if (price_dollar) {
		data['price'] = {
			'iso_code': 'USD',
			'value': Number(price_dollar),
		}
	}
	
	const stars = $('.star-box').children()
	let star_count = 0
	for (const star of stars) {
		const $star = $(star)
		if ($star.hasClass('ico-star')) {
			star_count += 1
		} else if ($star.hasClass('ico-star_half')) {
			star_count = star_count + 0.5
		}
	}
	data['rating'] = star_count

	if (isVolume) {
		series_data['volume'] = data
	} else {
		series_data['chapter'] = data
	}
	return BookWalkerGlobalMangaBakaSeries.strict().parse(series_data)
}

/*
export function worker_produce(worker: QueueClient) {
	//const log = Logger.label('ann_news_schedule_refresh')

	const options: TraceOptions & tracer.SpanOptions = {
		tags: {
			[tags.MANUAL_KEEP]: true,
			[tags.SPAN_KIND]: kinds.PRODUCER,
			[tags.SPAN_TYPE]: 'worker',
		},
	}

	return tracer.wrap('ann_news_schedule_refresh', options, async () => {
		const rows = await SourceAnimeNewsNetwork.scope('due_for_update').findAll()
		if (rows.length == 0) {
			log.debug('No AnimeNewsNetwork entries due for news refresh')

			return
		}

		for (const row of rows) {
			log.info('AnimeNewsNetwork', row.id, 'will be scheduled for news refresh')

			await update_last_scheduled_at(row)
			await worker.send(Queue.news_ann_work, { id: row.id })
		}
	})
}

export async function worker_consume_batch(jobs: RefreshSeriesNewsPayload) {
	const log = Logger.label('ann_refresh_news_batch')
	log.info('Processing', jobs.length, 'jobs concurrently')

	await Promise.allSettled(
		jobs.map(async (job) => {
			try {
				await worker_consume([job])
				await QueueClient.Worker.boss.complete(Queue.news_ann_work.name, job.id)
			} catch (err) {
				await QueueClient.Worker.boss.fail(Queue.news_ann_work.name, job.id, err as object)
			}
		}),
	)

	log.info('Done processing', jobs.length, 'jobs concurrently')
}

export async function worker_consume([job]: RefreshSeriesNewsPayload) {
	const log = Logger.label(`ann_refresh_news`)

	const options: TraceOptions & tracer.SpanOptions = {
		tags: {
			[tags.MANUAL_KEEP]: true,
			[tags.SPAN_KIND]: kinds.CONSUMER,
			[tags.SPAN_TYPE]: 'worker',
			series: job.data,
		},
	}

	await tracer.trace('ann_refresh_news', options, async () => {
		// ! Don't wrap in a big transaction, it can be incredible slow and failing one entry
		// ! would undo all of them

		const row = await SourceAnimeNewsNetwork.findByPk(job.data.id)
		if (!row) {
			log.warn('could not find AnimeNewsNetwork row with ID', job.data.id)
			return
		}

		log.info('Updating AnimeNewsNetwork entry [', row.id, ']')

		await refresh_news(row)
	})
}

function update_last_scheduled_at(row: SourceAnimeNewsNetwork) {
	row.last_scheduled_at = new Date()
	return row.save()
}

export async function worker_consume_discover_new_entries() {
	const log = Logger.label(`worker_consume_discover_new_entries`)

	const resp = await axios.get(`https://www.animenewsnetwork.com/encyclopedia/reports.xml?id=149`)
	const result = parser.toJson(resp.data, { object: true, coerce: true })
	const report = result.report as { item: any[] }

	for (const item of report.item as any[]) {
		const id = item.manga.href.split('?id=')[1]
		if (!id) {
			log.warn('Could not find ID for encyclopedia entry')
			continue
		}

		const [, created] = await SourceAnimeNewsNetwork.findOrCreate({
			where: { id },
		})

		if (created) {
			log.info('Discovered new ANN encyclopedia entry', id)
		}
	}
}
*/