/* global $ */

const API_URL = 'http://localhost:3000/api'

const GAUGE_MAX_MM = 30

const TIDE_CAPTIONS = {
  falling:
    '<strong>Falling tide.</strong> The creek drains into the Thames, so a spill is carried away from Stratford.',
  rising:
    '<strong>Rising tide.</strong> The Thames pushes up Bow Creek, so a spill is carried back toward Stratford.',
}

function showTide(tide) {
  $('#river').toggleClass('rising', tide === 'rising')

  $('.tide-button').attr('aria-pressed', 'false')
  $('.tide-button[data-tide="' + tide + '"]').attr('aria-pressed', 'true')

  $('#tide-caption').html(TIDE_CAPTIONS[tide])
}

$('.tide-button').on('click', function () {
  showTide($(this).data('tide'))
})

$('#last-updated').text('Loading live data…')

$.getJSON(API_URL + '/status')
  .done(function (response) {
    const data = response.data

    if (data.rainfall && data.rainfall.count > 0) {
      $('#rain-now').text(data.rainfall.total24hMm + ' mm').removeClass('is-empty')
    }

    const outfalls = data.discharges.items
    if (outfalls.length > 0) {
      let spilling = 0
      $.each(outfalls, function (i, outfall) {
        // isDischarging is true/false when live, 1/0 from the database
        if (Number(outfall.isDischarging) === 1) {
          spilling = spilling + 1
        }
      })
      $('#spilling-now')
        .html(spilling + '<span class="reading-of"> of ' + outfalls.length + '</span>')
        .removeClass('is-empty')
    }

    if (data.tide && data.tide.tidalPhase) {
      const tide = data.tide.tidalPhase === 'FLOOD' ? 'rising' : 'falling'
      $('#tide-now')
        .text(tide === 'rising' ? 'Rising' : 'Falling')
        .removeClass('is-empty')

      $('.tide-button[data-tide="' + tide + '"]').addClass('is-now')
      showTide(tide)
    }

    const time = new Date(response.timestamp).toLocaleTimeString('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
    })
    $('#last-updated').text('Live, updated ' + time)
  })
  .fail(function () {
    $('#last-updated').text('Live data unavailable')
    $('#live-message').text(
      "Live readings aren't available right now. The rest of the page still works, so read on, or try again in a few minutes."
    )
  })

$.getJSON(API_URL + '/thresholds').done(function (response) {
  const outfalls = response.data

  if (outfalls.length === 0) {
    $('#lowest-rain-text').text(
      "We haven't recorded a spill yet. This number will appear after the first one."
    )
    return
  }

  const first = outfalls[0]
  const mm = Number(first.minRain24hMm)
  $('#lowest-rain').text(mm + ' mm')

  const percent = Math.min(mm / GAUGE_MAX_MM, 1) * 100
  $('#gauge-fill').css('height', percent + '%')

  let totalSpills = 0
  $.each(outfalls, function (i, outfall) {
    totalSpills = totalSpills + Number(outfall.spillCount)
  })

  $('#lowest-rain-text').text(
    'Rain at Walthamstow in the 24 hours before a spill at ' +
      first.locationName +
      ', the lowest of the ' +
      totalSpills +
      ' spills we have recorded.'
  )
})
