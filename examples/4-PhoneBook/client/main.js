'use strict';

const dbus    = require ('dbus-native')
const inspect = require ('util').inspect
const Promise = require ('bluebird')

const BUS_READY_TIMEOUT = 5 // in s

const bus = dbus.sessionBus()
if (!bus) {
	throw new Error ('Could not connect to the DBus session bus.')
}

bus.on('ready', _ => proceed())

let readyTimeout = setTimeout( _ => {
	throw new Error('Bus was not ready after ' + BUS_READY_TIMEOUT + ' seconds. Timeout.')
}, BUS_READY_TIMEOUT * 1000)

function proceed() {
	const remoteServiceName = 'com.example.PhoneBook'
	clearTimeout(readyTimeout)

	console.log(`Begin, waiting for proxy to service '${remoteServiceName}' to connect...`)

	// This is how we make a proxy to a remote DBus service
	const proxy = bus.mkProxy(remoteServiceName)

	/*
		The call to `mkProxy()` returns immediately.
		You need to wait for the 'connected' event that tells you the remote DBus service joined the bus (because at
		the time you create the proxy, you do not know if the remote DBus service is connected or not)
	*/
	proxy.on('connected', _ => {
		const obj = proxy['/'].com.example.PhoneBook
		const iface = obj['com.example.PhoneBook']

		startSequence(iface)
	})

}

// The 'proxy' object here is a DBusInterface
function startSequence (proxy) {
	let alice
	let bob

	// All DBusProxy calls are promisified, so use promises everywhere
	return Promise.try( _ => {
		console.log(`Proxy connected!`)

		// Here we add a contact 'Alice'
		console.log(`Creating contact 'Alice'...`)
		return proxy.AddContact('Alice', '555-1234', 25)
	})
	.then( path => {
		// Save its object path
		alice = path

		// Ask how many contacts we have created (should be `1`)
		console.log('Asking how many contact we have...')
		return proxy.NbContacts()
	})
	.then( nb => {
		console.log(`We have ${nb} contact(s) (should be 1)\nAdding 'Bob'`)

		return proxy.AddContact('Bob', '555-7890', 56)
	})
	.then( path => {
		bob = path

		console.log(`Asking again how many contacts...`)

		return proxy.NbContacts()
	})
	.then( nb => {
		console.log(`We have now ${nb} contact(s) (should be 2)\nAsking for the contacts lists:`)

		return proxy.Contacts()
	})
	.then( contacts => {
		for (let contact of contacts) {
			const contactPath = contact[0]
			const contactName = contact[1]

			console.log(`Contacts '${contactName}' has path: '${contactPath}'`)
		}

		console.log('Deleting Bob...')
		return proxy.DeleteContacts([bob])
	})
	.then( _ => {
		console.log('Asking how many contacts now...')

		return proxy.NbContacts()
	})
	.then( nb => {
		console.log(`New number of contacts: ${nb} (should be 1)`)
	})
	.then( _ => {
		console.log('Bye!')
	})
}

// DBus service class generated with DBusGenesis!
