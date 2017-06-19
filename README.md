node-dbus
===========
D-bus protocol client and server for node.js

[![Build Status](https://secure.travis-ci.org/sidorares/node-dbus.png)](http://travis-ci.org/sidorares/node-dbus)

Installation
------------

```shell
npm install dbus-native
```
or

```shell
git clone https://github.com/sidorares/node-dbus # clone the repo
cd node-dbus
npm install # install dependencies
sudo cp examples/com.github.sidorares.dbus.Example.conf /etc/dbus-1/system.d/ # if you want to test examples/service.js
```

## Usage
To declare a function to be a DBus Method (that is, callable by other DBus services or clients), you need to call `DBusMethod()` on it. Here is the full syntax an explanation (I suggest you follow this with an example form the `examples/` directory, for instance the simplest `1-SimpleService`, which I use to give examples):

- The first argument must be the Javascript 'class' that represents the DBus interface (it should inherit from `DBusInterface`). For instance `SimpleService`.
- The second argument is the name of the function you are exposing. Note that this will be the name under which the DBus Method will appear, **and** it must also be the name of the method of the Javascript class. In other words, in the `1-SimpleService` example, the functoin is called `SayHello`, this will be its name on the DBus bus, and it's also the name of the Javascript function.
- The third and last argument is an object describing the method's signature (_i.e._ its input and output types). The syntax of this object is as follow:
    - it must have two keys exactly: `input` and `output`
    - `input` and `output` must be an array of object
    - this objects must be single-key objects, so something like this: `{key: value}`.
    - the `key` is the **name of the argument** and the `value` is the **type of the argument**, _in the DBus syntax_.
    - For instance, in the `1-SimpleService` example, we have:  
    ```
    {
    	input: [
    		{who: t.DBUS_STRING},
    	],
    	output: [
    		{hello_sentence: t.DBUS_STRING},
    	],
    }
    ```
    - We can see one input argument and one output argument.  
    The input argument is called `who` and is of type `string`.  
    The output argument is called `hello_sentence` and is of type `string`.
- Since DBus types are somewhat mystic to understand (for instance, `ssia{sv}o` is a valid, 5-argument DBus type), I provide helpers that are more verbose, but much more easy to understand (see corresponding section in this README)

To declare a DBus property, the same system as for declaring a DBus method is used, with slight changes:
- As with `DBusMethod()`, the first argument is the class name (no change)
- The second argument is the property name. The same rule applies for naming: this must be the name under which the property will appear on the DBus bus **and** this must be the name of the Javascript property.
- The third (and last) argument is a single-key object ; the key must be either: `readwrite`, `read` or `write`. It defines the access mode of the property (namely `read-write`, `read-only` or `write-only` (this last one is weird, avoid it)).  
The value must be a DBus type (again, helpers are provided).

To declare that an interface fires a signal, you must use the same kind of annotation function as for methods and properties. It is called `DBusSignal(). The syntax is very similar:
- As with `DBusMethod()` and `DBusProperty()` the first argument is the class that we are annotating
- The second argumnet is the name of the DBus signal that this interface can emit. Note that as for `DBusMethod()` and `DBusProperty`, the name must be the name of the DBus signal as seen on the bus **and** the name of the Javascript event that will be emitted with `obj.emit()`.
- The third (and last) argument is the same object as for `DBusMethod()`, with the exception that it should only have the `output` key (and not the `input` one).

**Important**: please note that in the three annotation functions `DBusMethod()`, `DBusProperty()` and `DBusSignal()`, I always mentioned that the first argument is **the class** itself and **not** the _name_ of the class. If you look at the examples in the `examples/` directory, you will see that I don't write a string `"SimpleService"`, but I pass the **class itself**: `SimpleService`, so the syntax is `DBusMethod(SimpleService, ...)` and **not** `DBusMethod("SimpleService", ...)`.

This is a common source of error, make sure not to fall into that (or use the `dbus-genesis` helper tool!)

## Examples
Lots of examples can be found in the `example/` directory. Each example is heavily commented to show the important and relevant parts. Note that as examples progress, I don't re-comment everything so that the more advanced use cases don't become too bloated.  
Here are the list with the demonstrated usage case:

- 1-SimpleService
    - Shows the most basic usage

Usage
------

Short example using desktop notifications service

```js
var dbus = require('dbus-native');
var sessionBus = dbus.sessionBus();
sessionBus.getService('org.freedesktop.Notifications').getInterface(
    '/org/freedesktop/Notifications',
    'org.freedesktop.Notifications', function(err, notifications) {

    // dbus signals are EventEmitter events
    notifications.on('ActionInvoked', function() {
        console.log('ActionInvoked', arguments);
    });
    notifications.on('NotificationClosed', function() {
        console.log('NotificationClosed', arguments);
    });
    notifications.Notify('exampl', 0, '', 'summary 3', 'new message text', ['xxx yyy', 'test2', 'test3', 'test4'], [],  5, function(err, id) {
       //setTimeout(function() { n.CloseNotification(id, console.log); }, 4000);
    });
});
```

API
---

### Low level messaging: bus connection

`connection = dbus.createClient(options)`

options:
   - socket - unix socket path
   - port - TCP port
   - host - TCP host
   - busAddress - encoded bus address. Default is `DBUS_SESSION_BUS_ADDRESS` environment variable. See http://dbus.freedesktop.org/doc/dbus-specification.html#addresses
   - ( TODO: add/document option to use adress from X11 session )

connection has only one method, `message(msg)`

message fields:
   - type - methodCall, methodReturn, error or signal
   - path - object path
   - interface
   - destination
   - sender
   - member
   - serial
   - signature
   - body
   - errorName
   - replySerial

connection signals:
   - connect - emitted after successful authentication
   - message
   - error

example:

```js
var dbus = require('dbus-native');
var conn = dbus.createConnection();
conn.message({
    path:'/org/freedesktop/DBus',
    destination: 'org.freedesktop.DBus',
    'interface': 'org.freedesktop.DBus',
    member: 'Hello',
    type: dbus.messageType.methodCall
});
conn.on('message', function(msg) { console.log(msg); });
```


### Links
   - http://cgit.freedesktop.org/dbus - freedesktop reference C library
   - https://github.com/guelfey/go.dbus
   - https://github.com/Shouqun/node-dbus - libdbus
   - https://github.com/Motorola-Mobility/node-dbus - libdbus
   - https://github.com/izaakschroeder/node-dbus - libdbus
   - https://github.com/agnat/node_libdbus
   - https://github.com/agnat/node_dbus - native js
   - https://github.com/cocagne/txdbus - native python + twisted
   - http://search.cpan.org/~danberr/Net-DBus-1.0.0/ (seems to be native, but requires libdbus?)
   - https://github.com/mvidner/ruby-dbus (native, sync)
   - http://www.ndesk.org/DBusSharp (C#/Mono)
   - https://github.com/lizenn/erlang-dbus/ - erlang
   - https://github.com/mspanc/dbux/ - elixir
   - http://0pointer.net/blog/the-new-sd-bus-api-of-systemd.html - Blog post about sb-bus and D-Bus in general
