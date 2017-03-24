'use strict';

const Peer              = require ('./std_ifaces/Peer.js')
const debug             = require ('debug')('dbus-native:DBusObjectLibs')
const utils             = require ('./utils.js')
const Errors            = require ('./Errors.js')
const inspect           = require ('util').inspect
const stdifaces         = require ('./stdifaces.js')
const Properties        = require ('./std_ifaces/Properties.js')
const Introspectable    = require ('./std_ifaces/Introspectable.js')
const xmlbuilder        = require ('xmlbuilder')
const DBusInterfaceLibs = require ('./DBusInterfaceLibs')

const mandatory = utils.mandatory

const InvalidNameError = Errors.InvalidNameError

const DBusInterface = DBusInterfaceLibs.DBusInterface

/** @module DBusObject */

/**
 * Represents a DBus Object.<br>
 * A DBusObject can have other (children) objects, and/or one (of several) interfaces.
 *
 * @param {DBusObject|DBusInterface} [objOrIface] - Optional object or interface to create as child for this object
 *
 * @throws {module:Errors#InvalidNameError}
 */
class DBusObject {
	constructor (objOrIface, relativePath) {
		// If the object is passed a DBusObject and we have a 'relativePath', make it a child
		if (objOrIface !== undefined && objOrIface instanceof DBusObject && relativePath !== undefined) {
			debug(`it's an object!`)
			this.addObject (objOrIface, relativePath)
		}
		// If the object is passed a DBusInterface, add it to this Object
		else if (objOrIface !== undefined && objOrIface instanceof DBusInterface) {
			// Warn the user in case a relative path is given with the interface
			// console.warn ('A relative path was given although an interface was passed, the name is useless and will be discarded')

			this.addInterface (objOrIface)
		}
		// Otherwise fail so that the user doesn't think whatever was passed was actually added
		else if (objOrIface !== undefined) {
			throw new TypeError (`DBusObject can only be created with an child object or an interface (or nothing).`)
		}

		// Add standard interface Properties
		this.addInterface (new Properties ('org.freedesktop.DBus.Properties'))

		// Add standard interface Peer
		this.addInterface (new Peer ('org.freedesktop.DBus.Peer'))

		// Add standard interface Introspectable
		this.addInterface (new Introspectable ('org.freedesktop.DBus.Introspectable'))
	}

	/**
	 * Generate introspection data for this object.<br>
	 * What it does is:
	 * <ul>
	 * <li>have all ints interfaces generate its introspection data</li>
	 * <li>list all children nodes (not the complete introspection data)</li>
	 * <li>concatenate and return</li>
	 * </ul>
	 */
	introspect () {
		let keys = Object.keys (this)
		let ifaces = this.getIfaceNames()
		let objs = this.getChildrenPaths()
		let xml = xmlbuilder.create ('node', {headless: true}) // Create root element without the <?xml version="1.0"?>
			.dtd ('-//freedesktop//DTD D-BUS Object Introspection 1.0//EN',
				'http://www.freedesktop.org/standards/dbus/1.0/introspect.dtd')
			.root() // don't forget to return to the root elem so that elems are not added to the DTD

		// Have each interface generate its introspection data and add it to the root XML element
		for (let iface of ifaces) {
			this[iface].introspect (xml)
		}

		// List each object as nodes
		for (let obj of objs) {
			xml.ele ('node', {name: obj})
		}

		// console.log (xml.end ({pretty: true}))

		// Return the XML string
		return xml.end ({pretty: true})
	}

	/**
	 * Add an interface (and thus a set of functions, methods and signals) to an Object
	 * @param {DBusInterface} iface  The interface to add to the object
	 * @throws {TypeError}
	 */
	addInterface (iface = mandatory()) {
		// Check that 'iface' is a DBusInterface
		if (! (iface instanceof DBusInterface)) {
			throw new TypeError (`'iface' is not a DBusInterface.`)
		}

		// Check if the iface we're trying to add has a valid name
		if (!utils.isValidIfaceName (iface._ifaceName)) {
			throw new TypeError (`'${iface._ifaceName}' is not a valid interface name.`)
		}

		// Everything looks good, proceed to add the interface to the object (erasing the previously one if present)
		this[iface._ifaceName] = iface

		// Give the interface a reference to the object it is associated to
		iface.__dbusObject = this

		if (this.getService()) {
			this.getService().bus.exposeInterface(this.getService(), this, iface._ifaceName, this.getPath())
		}
		// TODO: Implement & emit 'Interface added' from Object Manager
	}

	/**
	 * Remove an interface from this object.
	 * @param {string} a valid DBus Interface name string
	 * @throws {TypeError}
	 */
	removeInterface (ifaceName = mandatory()) {
		let iface
		if (this[ifaceName] instanceof DBusInterface) iface = this[ifaceName]
		else throw new TypeError (`'ifaceOrIfaceName is neither a DBusInterface nor a DBus interface name`)

		iface.destroy()
		delete this[ifaceName]
	}

	/**
	 * Remove all interfaces from this object
	 */
	removeAllInterfaces () {
		this.getIfaceNames().forEach(ifaceName => this.removeInterface(ifaceName))
	}

	/**
	 * Used to add a child object to either a {@link DBusService} or a {@link DBusObject}.
	 * @param {DBusObject}         object The child object to add
	 * @param {string}             relativePath The relative path at which add the child object
	 *
	 * @throws {TypeError}
	 */
	addObject (object = mandatory(), relativePath = mandatory()) {
		let pathComponents = relativePath.split ('/')
		let objectManagerIface = this['org.freedesktop.DBus.ObjectManager']

		// Check that 'object' is a DBusObject
		if (! (object instanceof DBusObject)) {
			throw new TypeError (`'object' is not a DBusObject.`)
		}

		// Check that all paths components are valid
		if (!pathComponents.every (utils.isValidPathComponent)) {
			throw new TypeError (`'${relativePath}' contains non-valid path components.`)
		}

		/*
		 * Everything looks good, traverse the object according to the path components, and add the obj as child
		 */
		let currObj = this
		// traverse the object

		while (pathComponents.length > 1) {
			let currPathComponent = pathComponents.shift()

			// If the current object doesn't already have an object at this path component, create one
			if (typeof currObj[currPathComponent] === 'undefined') {
				currObj[currPathComponent] = new DBusObject()
				currObj[currPathComponent]._linkParentObject(currObj, currPathComponent)
			}

			// traverse the object
			currObj = currObj[currPathComponent]
		}

		// Now we have traversed our object and reached the object path to host the child, so add it
		if (currObj[pathComponents[0]]) {
			throw new Error(`path ${relativePath} already exists`)
		}
		currObj[pathComponents[0]] = object

		currObj[pathComponents[0]]._linkParentObject(currObj, pathComponents[0])

		if (this.getService()) {
			debug(this.getPath())
			this.getService().bus.exposeObject(this.getService(), object, `${this.getPath()}/${relativePath}`)
		}

		// Check if the object has the interface ObjectManager
		if (objectManagerIface !== undefined) {
			// Compute the new object's path
			let objPath = this.getPath() + '/' + relativePath
			let ifacesAndProperties = {}

			// for (let iface of this.getIfaces()) { // 'this' is not the newly-added object!
			for (let iface of object.getIfaces()) {
				// For each interface of the newly-added object, get all props and values
				let ifaceName = iface._ifaceName
				// debug(`FOR '${ifaceName}'`)

				ifacesAndProperties[ifaceName] = {}

				for (let [propertyName, propAccess] of iface._ifaceDesc.properties) {
					let accessMode = Object.keys(propAccess)[0]

					// DBus spec says 'GetAll' should silently omit properties which can't be accessed
					if (accessMode !== 'write') {
						// Get the property type (used because we return a variant, so we need to type)
						let propType = propAccess[accessMode]
						// debug(`prop '${propertyName}' has access: '${accessMode}' and type '${propType}'`)

						// Build the variant objet for the property
						let variant = {
							type: propType,
							value: iface[propertyName]
						}

						// debug(`variant: ${inspect(variant)}`)
						// Add the variant entry in the return dict
						ifacesAndProperties[ifaceName][propertyName] = variant
						// debug(`ifacesAndProperties is now: ${inspect(ifacesAndProperties)}`)
					}
				}
			}

			debug(`About to emit InterfacesAdded with:\n${inspect(ifacesAndProperties)}`)
			// Emit signal 'InterfacesAdded'
			objectManagerIface.emit('InterfacesAdded', objPath, ifacesAndProperties)
		} else {
			debug(`No ObjectManager interface`)
		}
	}

	/**
	 * Remove a given object_path subtree
	 * @param {string} objPathComponent valid DBus object path
	 * @throws {TypeError} if objPathComponent is not a valid dbus object path string
	 */
	removeObject (objPathComponent = mandatory()) {
		let components = objPathComponent.split('/')
		if (!components.length) throw new TypeError('Invalid path component')
		let parentObj, targetObj, targetComponent

		targetComponent = components.shift()
		parentObj = this
		targetObj = parentObj[targetComponent]

		while (components.length) {
			targetComponent = components.shift()
			parentObj = targetObj
			targetObj = parentObj[targetComponent]
		}

		// Safely empty the object's children and itself
		this._removeObjectHierarchy(targetObj)
		// Remove reference in its parent object
		delete parentObj[targetComponent]
	}

    _removeObjectHierarchy(dbusObject = mandatory()) {
		let children = dbusObject.getChildren()
		if (!!children && !!children.length) {
			for (let child in children) {
				this._removeObjectHierarchy(child)
				this.__removeObjectProperties(child) }
		}
		this.__removeObjectProperties(dbusObject)
	}

	__removeObjectProperties(dbusObject = mandatory()) {
		dbusObject._unlinkParentObject();
		dbusObject.removeAllInterfaces();

		for (var key in dbusObject) {
			if (dbusObject.hasOwnProperty(key)) {
				delete dbusObject[key]
			}
		}
	}

	/**
	 * Get all direct sub path components of this object's path
	 */
	getChildrenPaths () {
		return Object.keys(this).filter(key => this[key] instanceof DBusObject && key !== '_parentObject')
	}

	/**
	 * Get all direct sub objects of this object
	 */
	getChildren () {
		return this.getChildrenPaths().map(key => this[key])
	}

	/**
	 * Get all iface names associated with this object
	 */
	getIfaceNames () {
		return Object.keys(this).filter(key => this[key] instanceof DBusInterface)
	}

	/**
	 * Get all ifaces associated with this object
	 */
	getIfaces () {
		return this.getIfaceNames().map(key => this[key])
	}

	/**
	 * Get parent object of this object if it exists
	 */
	getParentObject () {
		return this._parentObject
	}

	/**
	 * get the path component to which this object is located in the parent object if it exists
	 */
	getPathComponent () {
		return this._pathComponent
	}

	/**
	 * Get the service that exposes this object if it exists
	 */
	getService () {
		return this._service
	}

	/**
	 * set the service that exposes this object path
	 * @param {DBusService} service
	 */
	setService (service) {
		this._service = service
	}

	/**
	 * Returns the full path to access this object (or the least relative path if the object is not exposed yet)
	 */
	getPath () {
		let path = []
		let currObj = this
		let component

		while (currObj && (component = currObj.getPathComponent())) {
			path.unshift(component)
			currObj = currObj.getParentObject()
		}

		path = path.join('/')
		if (this.getService()) {
			path = '/'+path
		}

		return path
	}

	_unlinkParentObject () {
		this._parentObject = null
		this._pathComponent = null
	}

	_linkParentObject (parent, pathComponent) {
		this._parentObject = parent
		this._pathComponent = pathComponent
	}
}

module.exports = {
	DBusObject,
}
