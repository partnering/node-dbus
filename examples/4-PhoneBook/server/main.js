'use strict';

const dbus    = require ('dbus-native')
const inspect = require ('util').inspect
const Promise = require ('bluebird')
const PhoneBook = require ('./PhoneBook.js')

const DBusService    = dbus.DBusService
const DBusObjectLibs = dbus.DBusObjectLibs

const DBusObject = DBusObjectLibs.DBusObject

// Time after which we will timeout if the bus is not ready by then
const BUS_READY_TIMEOUT = 5 // in s

// The name we want to expose our DBus service on
const serviceName = 'com.example.PhoneBook'
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

	let iface = new PhoneBook (interfaceName)

	/*
		Create the main object that implements the main interface
		Note that it is also possible to add an interface with `obj.addInterface (iface)`
	*/
	let obj = new DBusObject (iface) // add the interface directly on build

	// Create the service
	let service = new DBusService ()

	// Add the main object as child to the service (note that the path must be relative: no initial '/')
	service.addObject (obj, objectPath.substr(1))

	// Expose the service on the bus so that it's usable by other services and clients
	bus.exposeService (service, serviceName) // the call is promisified
	.then (() => {
		console.log ('Service exposed and ready to answer calls, with name \'' + serviceName + '\'')
	})
	.catch( (err) => {
		console.error ('Failed to exposed service on bus: ' + err)
	})
}

// DBus service class generated with DBusGenesis!
