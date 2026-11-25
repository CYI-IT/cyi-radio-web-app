const { timeSeconds } = require('./occurrences.cjs')

class ScheduleError extends Error {
  constructor(message, details) {
    super(message)
    this.details = details
  }
}

function fields(input, allowed) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new ScheduleError('Provide a JSON object.')
  }
  for (const key of Object.keys(input)) {
    if (!allowed.includes(key)) throw new ScheduleError(`Unknown field ${key}.`)
  }
}

function text(value, name, limit, optional = false) {
  if (optional && value == null) return null
  if (typeof value !== 'string' || !value.trim() || value.length > limit || value.includes('\0')) {
    throw new ScheduleError(`${name} must contain 1 to ${limit} characters.`)
  }
  return value.trim()
}

function emailAddress(value) {
  const email = text(value, 'Email', 254).toLowerCase()
  if (!/^[^\s@]+@[^\s@]+$/.test(email)) throw new ScheduleError('Enter a valid email address.')
  return email
}

function uuid(value, label = 'ID') {
  if (typeof value !== 'string' || !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value)) {
    throw new ScheduleError(`${label} must be a UUID.`)
  }
  return value.toLowerCase()
}

function date(value, label) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith('0000')) {
    throw new ScheduleError(`${label} must be a calendar date in YYYY-MM-DD format.`)
  }
  const parsed = new Date(`${value}T00:00:00Z`)
  if (!Number.isFinite(parsed.valueOf()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new ScheduleError(`${label} must be a valid calendar date.`)
  }
  return value
}

function time(value, label) {
  if (typeof value !== 'string' || !/^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(value)) {
    throw new ScheduleError(`${label} must be a local time in HH:MM or HH:MM:SS format.`)
  }
  return value.length === 5 ? `${value}:00` : value
}

function duration(input, startTime, fallback) {
  if ('durationMinutes' in input && 'endTime' in input) {
    throw new ScheduleError('Provide either durationMinutes or endTime.')
  }
  let minutes = 'durationMinutes' in input ? input.durationMinutes : fallback
  if ('endTime' in input) {
    const difference = timeSeconds(time(input.endTime, 'endTime')) - timeSeconds(startTime)
    minutes = (difference > 0 ? difference : difference + 86400) / 60
  }
  if (minutes === null && fallback === null) return null
  if (!Number.isInteger(minutes) || minutes < 1 || minutes > 2_147_483_647) {
    throw new ScheduleError('The duration must be a positive whole number of minutes.')
  }
  return minutes
}

function enumValue(value, name, allowed) {
  if (!allowed.includes(value)) throw new ScheduleError(`${name} must be one of ${allowed.join(', ')}.`)
  return value
}

function weekdayMask(value) {
  if (Array.isArray(value) && value.every(day => Number.isInteger(day) && day >= 1 && day <= 7)) {
    value = value.reduce((mask, day) => mask | (1 << (day - 1)), 0)
  }
  if (!Number.isInteger(value) || value < 1 || value > 127) {
    throw new ScheduleError('Weekly schedules need weekdays from 1 (Monday) through 7 (Sunday).')
  }
  return value
}

function catalogInput(input, previous, labelField, descriptionField) {
  fields(input, ['slug', labelField, descriptionField, 'imagePath'])
  const merged = { ...previous, ...input }
  const slug = text(merged.slug, 'Slug', 100)
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    throw new ScheduleError('Use lowercase letters, numbers and hyphens in the slug.')
  }
  const imagePath = text(merged.imagePath, 'Image path', 500, true)
  if (imagePath && (!imagePath.startsWith('/') || imagePath.startsWith('//') || imagePath.includes('\\'))) {
    throw new ScheduleError('Image path must be a local path starting with a single slash.')
  }
  return {
    slug, imagePath,
    [labelField]: text(merged[labelField], labelField, 200),
    [descriptionField]: text(merged[descriptionField], descriptionField, 5_000, true),
  }
}

function seriesInput(input, previous) {
  fields(input, ['programmeId', 'presenterId', 'kind', 'publicationStatus', 'startsOn', 'startTime',
    'durationMinutes', 'endTime', 'weekdays', 'endsOn', 'overrideReason'])
  const merged = { publicationStatus: 'draft', ...previous, ...input }
  const kind = enumValue(merged.kind, 'kind', ['one-time', 'weekly'])
  const startsOn = date(merged.startsOn, 'startsOn')
  const startTime = time(merged.startTime, 'startTime')
  const recurring = kind === 'weekly'
  if (!recurring && (input.weekdays != null || input.endsOn != null)) {
    throw new ScheduleError('Weekdays and an end date apply to weekly schedules.')
  }
  const endsOn = recurring && merged.endsOn != null ? date(merged.endsOn, 'endsOn') : null
  if (endsOn && endsOn < startsOn) throw new ScheduleError('endsOn must be on or after startsOn.')
  return {
    programmeId: uuid(merged.programmeId, 'programmeId'),
    presenterId: uuid(merged.presenterId, 'presenterId'),
    kind, startsOn, startTime, endsOn,
    weekdays: recurring ? weekdayMask(merged.weekdays) : null,
    durationMinutes: duration(input, startTime, previous?.durationMinutes),
    publicationStatus: enumValue(merged.publicationStatus, 'publicationStatus', ['draft', 'published']),
  }
}

function exceptionInput(input, series) {
  const changeFields = ['startsOn', 'startTime', 'durationMinutes', 'endTime', 'presenterId']
  fields(input, ['action', ...changeFields, 'overrideReason'])
  const action = enumValue(input.action, 'action', ['cancel', 'override'])
  const hasChanges = changeFields.some(key => input[key] != null)
  if (hasChanges !== (action === 'override')) {
    throw new ScheduleError('An override needs at least one changed field. A cancellation takes no changes.')
  }
  const startTime = input.startTime == null ? null : time(input.startTime, 'startTime')
  return {
    action, startTime,
    startsOn: input.startsOn == null ? null : date(input.startsOn, 'startsOn'),
    durationMinutes: duration(input, startTime ?? series.startTime, null),
    presenterId: input.presenterId == null ? null : uuid(input.presenterId, 'presenterId'),
  }
}

module.exports = { ScheduleError, fields, text, emailAddress, uuid, date, catalogInput, seriesInput, exceptionInput }
