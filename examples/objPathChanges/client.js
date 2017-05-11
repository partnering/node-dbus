'use strict';

const dbus    = require ('../../index.js')
const inspect = require ('util').inspect
const Promise = require ('bluebird')

const DBusService    = dbus.DBusService
const DBusObjectLibs = dbus.DBusObjectLibs

const DBusObject = DBusObjectLibs.DBusObject

// Time after which we will timeout if the bus is not ready by then
const BUS_READY_TIMEOUT = 5 // in s

// The name of the service for which we want to make a proxy
const serviceName = 'com.test.PhoneBook'
const interfaceName = serviceName
const objectPath = '/' + serviceName.replace (/\./g, '/')

const bus = dbus.sessionBus()
if (!bus) {
	throw new Error ('Could not connect to the DBus session bus.')
}

bus.on('ready', _ => proceed())

let readyTimeout = setTimeout( _ => {
	throw new Error('Bus was not ready after ' + BUS_READY_TIMEOUT + ' seconds. Timeout.')
}, BUS_READY_TIMEOUT * 1000)

function proceed() {
	clearTimeout(readyTimeout)

	let phoneBook = bus.mkProxy(serviceName)
	let temp

	phoneBook.on('disconnected', _ => {
		console.log('Target service disconnected, waiting for new connection...\n\n')
	})

	phoneBook.on('connected', _ => {
		console.log('Target service connected, beginning routines...')

		let obj = phoneBook['/'].com.test.PhoneBook
		let iface = obj['com.test.PhoneBook']

		iface.CreateNewContact('Michelle', 'Obama', '555-54321', Math.round(50 * Math.random()))
		.then( objPath => {
			console.log('Created at: ' + objPath)
			console.log(`Checking if property 'Contacts' got updated...`)
			temp = objPath

			return iface.Contacts()
		})
		.then( c => {
			console.log(`Contacts: ${inspect(c)}`)
		})
		.delay(500)
		.then( _ => {
			console.log('Getting new contact\'s name and age');
			return obj.Contacts.MichelleObama['com.test.PhoneBook.Contact'].Name()
		})
		.then( name => {
			console.log(`Got name: ${name}`)
			console.log('Changing name')
			return obj.Contacts.MichelleObama['com.test.PhoneBook.Contact'].Name('Suzy')
		})
		.delay(500)
		.then( _ => {
			return obj.Contacts.MichelleObama['com.test.PhoneBook.Contact'].Name()
		})
		.then( newName => {
			console.log(`New name: ${newName}`)
		})
		.delay(1000)
		.then( _ => {
			console.log('Delete newly-created contact...')
			return iface.DeleteContact(temp)
		})
		.then( _ => {
			console.log('Checking if the path was deleted: ' + (obj.Contacts.MichelleObama === undefined))
		})
	})
}

// DBus service class generated with DBusGenesis!
