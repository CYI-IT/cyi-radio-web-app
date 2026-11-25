function createChatDay(timezone) {
  const day = new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone, year: 'numeric', month: 'numeric', day: 'numeric',
  })
  const searchSpan = 36 * 60 * 60 * 1000
  let window

  function boundary(low, high, predicate) {
    while (high - low > 1) {
      const middle = Math.floor((low + high) / 2)
      if (predicate(day.format(middle))) high = middle
      else low = middle
    }
    return high
  }

  return function chatDay(now = Date.now()) {
    if (window && now >= window.start && now < window.end) return window

    const today = day.format(now)
    window = {
      start: boundary(now - searchSpan, now, date => date === today),
      end: boundary(now, now + searchSpan, date => date !== today),
    }
    return window
  }
}

module.exports = { createChatDay }
