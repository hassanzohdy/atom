# Atoms

A powerful state management tool that could be used within any UI framework or Nodejs App.

## Why?

The main purpose of the birth of this package is to work with a simple and performant state management tool to handle data among components and outside components.

## Features

- Simple and easy to use
- Won't take more than few minutes to **master it**.
- Can be used outside components.
- Listen to atom's value change.
- Listen to atom's object property change.
- Lightweight in size.
- Easy Managing Objects, Arrays, and booleans.
- Open for Extension using Atom Actions.

## React Atom

For React users, we have a [dedicated package](https://github.com/hassanzohdy/mongez-react-atom) that works perfectly with React, it has some extra features that would fit with React components.

## Installation

`yarn add @mongez/atom`

Or

`npm i @mongez/atom`

Or

`pnpm add @mongez/atom`

## Atoms are unique

Atoms are meant to be **unique** therefore the atom `key` can not be used in more than one atom, if other atom is being created with a previously defined atom, an error will be thrown that indicates to use another atom key.

## Create A New Atom

The main idea here is every single data that might be manipulated will be stored independently in a shape of an `atom`.

This will raise the power of single responsibility.

```ts
import { createAtom, Atom } from "@mongez/atom";

export const currencyAtom: createAtom<string> = createAtom({
  key: "currency",
  default: "EUR",
});
```

> Please note that all atoms are immutables, the default data will be kept untouched if it is an object or an array.

When creating a new atom, it's recommended to pass the atom's value type as a generic type to the `atom` function, this will help you use the atom's value in a type-safe way.

## Using Atoms

Now the `currencyAtom` atom has only single value, from this point we can use it in anywhere in our application components or event outside components.

> For demo purposes only, we'll use React in this documentation, but you can use the atom in any UI framework or even in Nodejs.

`some-component.ts`

```tsx
import { useEffect, useState } from "react";
import { currencyAtom } from "~/src/atoms";

export default function Header() {
  const [currency, setCurrency] = useState(currencyAtom.value);

  useEffect(() => {
    // Watch for currency changes
    return currencyAtom.onChange(setCurrency);
  }, []);

  return (
    <>
      <h1>Header</h1>
      Currency: {currency}
    </>
  );
}
```

The `onChange` method will listen for any changes happen in the atom and return an [Event Subscription](https://github.com/hassanzohdy/mongez-events#event-subscription) that has `unsubscribe` method to remove the listener, this could be used in the cleanup process.

Another way to write the previous use effect for more readability.

```tsx
useEffect(() => {
  const eventSubscription = currencyAtom.onChange(setCurrency);
  return () => eventSubscription.unsubscribe();
}, []);
```

## Types of atom values

Any atom must have a `default` value when initializing it, this value can be any type, it can be a string, number, boolean, object, array, however, when the default value is an `object`, the atom gets a **special treatment**.

We will see this later in the documentation.

## Get atom value

Atom's value can be fetched in different ways, depends what are you trying to do.

For example, if you're using the atom outside a `React component` or you're using it inside a component but don't want to rerender the component when the atom's value changes, you can use the `atom.value` property.

```ts
// anywhere in your app
import { currencyAtom } from "~/src/atoms";

console.log(currencyAtom.value); // get current value
```

## Update atom's value

The basic way to update atom's value is by using `atom.update`, this method receives the new value of the atom and updates it.

```ts
// anywhere in your app
import { currencyAtom } from "~/src/atoms";

currencyAtom.update("USD"); // any component using the atom will be rerendered automatically.
```

We can also pass a callback to the update function, the callback will receive the old value and the atom instance.

```ts
// anywhere in your app
import { currencyAtom } from "~/src/atoms";

currencyAtom.update((oldValue, atom) => {
  // do something with the old value
  return "USD";
});
```

> Please do remember that `atom.update` must receive a new reference of the value, otherwise it will not trigger the change event, for example `atom.update({ ...user })` will trigger the change event.

```ts
// /src/atoms/user-atom.ts
import { createAtom } from "@mongez/atom";

export type UserData = {
  name: string;
  email: string;
  age: number;
  id: number;
};

export const userAtom = createAtom<UserData>({
  key: "user",
  default: {
    name: "Hasan",
    age: 30,
    email: "hassanzohdy@gmail.com",
    id: 1,
  },
});
```

Now if we want to make an update for the user atom using `atom.update`, it will be something like this:

```ts
// anywhere in your app

import { userAtom } from "~/src/atoms/user-atom";

userAtom.update({
  ...userAtom.value,
  name: "Ahmed",
});
```

Or using callback to get the old value:

```ts
// anywhere in your app

import { userAtom } from "~/src/atoms/user-atom";

userAtom.update((oldValue) => {
  return {
    ...oldValue,
    name: "Ahmed",
  };
});
```

## Merge atom's value

If the atom is an object atom, you can use `atom.merge` to merge the new value with the old value.

```ts
// src/atoms/user-atom.ts
import { createAtom } from "@mongez/atom";

export type UserData = {
  name: string;
  email: string;
  age: number;
  id: number;
};

export const userAtom = createAtom<UserData>({
  key: "user",
  default: {
    name: "Hasan",
    age: 30,
    email: "hassanzohdy@gmail.com",
    id: 1,
  },
});
```

Now if we want to make an update for the user atom using `atom.update`, it will be something like this:

```ts
// anywhere in your app
import { userAtom } from "~/src/atoms";

userAtom.update({
  ...userAtom.value,
  name: "Ahmed",
  age: 25,
});
```

If you notice, we've to spread the old value and then add the new values, this is good, but we can use `atom.merge` instead.

```ts
// anywhere in your app
import { userAtom } from "~/src/atoms";

userAtom.merge({
  name: "Ahmed",
  age: 25,
});
```

This is just a shortcut for `atom.update`, it will merge the new value with the old value and then update the atom.

## On Atom Reset

To listen to atom when it is reset, use `onReset` method.

```ts
// anywhere in your app
import { currencyAtom } from "~/src/atoms";

currencyAtom.onReset((atom) => {
  //
});
```

> This will be triggered after the update event is triggered

## Changing only single key in the atom's value

Instead of passing the whole object to the `setUser` function, we can pass only the key we want to change using `atom.change` function.

```tsx
import React from "react";
import { userAtom } from "~/src/atoms";

export default function UserForm() {
  const [user, setUser] = React.useState(userAtom.value);

  React.useEffect(() => {
    return userAtom.onChange(setUser);
  }, []);

  return (
    <>
      <h1>User Form</h1>
      <input
        type="text"
        value={user.name}
        onChange={(e) => userAtom.change("name", e.target.value)}
      />
      <input
        type="text"
        value={user.email}
        onChange={(e) => userAtom.change("email", e.target.value)}
      />
    </>
  );
}
```

This will change only the given key in the atom's value, and trigger a component rerender if the atom's value is used in the component.

> Please note that `change` method calls `update` method under the hood, so it will generate a new object.

## Get Atom single key value

If atom's value is an object, we can get a value from the atom directly using `atom.get` function.

```ts
import { createAtom } from "@mongez/atom-react";

const userAtom = createAtom({
  key: "user",
  default: {
    key: "Hasan",
    address: {
      city: "New York",
    },
  },
});

console.log(userAtom.get("key")); // Hasan
```

Dot Notation is also supported.

```ts
console.log(userAtom.get("address.city")); // New York
```

If key doesn't exist, return default value instead.

```ts
console.log(userAtom.get("email", "default@email.com")); // default@email.com
```

## Reset value

This feature might be useful in some scenarios when we need to reset the atom's value to its default value.

```ts
// anywhere in your app
import { currencyAtom } from "~/src/atoms";

currencyAtom.reset(); // any component using the atom will be rerendered automatically.
```

This will trigger an atom update and set the atom's value to its default value.

## Silent Update (Update without triggering change event)

Works exactly like `update` method, but it will not trigger the change event.

```ts
// anywhere in your app
import { currencyAtom } from "~/src/atoms";

currencyAtom.silentUpdate("USD"); // any component using the atom will be rerendered automatically.
```

## Silent Reset Value (Reset without triggering change event)

Sometimes its useful to reset the atom's value to its default value without triggering the change event, this can be achieved using `silentReset` method, a good sue case for this is when a component is unmounted and you want to reset the atom's value to its default value without triggering the change event.

```tsx
// Header.tsx
import { currencyAtom } from "~/src/atoms";
import { useEffect } from "react";

export default function Header() {
  const currency = currencyAtom.useValue();

  useEffect(() => {
    return () => currencyAtom.silentReset();
  }, []);

  return (
    <>
      <h1>Header</h1>
      Currency: {currency}
    </>
  );
}
```

This will not trigger the value change event, but it will reset the atom's value to its default value and **the reset event will be triggered though**

## Silent Change (Change without triggering change event)

Works exactly like `change` method, but it will not trigger the change event.

```ts
// anywhere in your app
import { userAtom } from "~/src/atoms";

userAtom.silentChange("name", "Ahmed");
```

## Destroy atom

We can also destroy the atom using `destroy()` method from the atom, it will automatically fire the `onDestroy` event.

```ts
// anywhere in your app
import { currencyAtom } from "~/src/atoms";

currencyAtom.destroy();
```

## Getting atom key

To get the atom key, use `atom.key` will return the atom key.

```ts
// anywhere in your app
import { currencyAtom } from "~/src/atoms";

console.log(currencyAtom.key); // currencyAtom
```

## Getting all atoms

To list all registered atoms, use `atomsList` utility for that purpose.

```ts
// anywhere in your app
import { atomsList } from "~/src/atoms";

console.log(atomsList()); // [currencyAtom, ...]
```

## get handler function

Sometimes we may need to handle the `atom.get` function to get the data in a customized way, we can achieve this by defining in the atom function call how the atom will retrieve the object's value.

Without Defining the `atom getter`

```ts
const settingsAtom = createAtom({
  key: "user",
  default: {
    isLoaded: false,
    settings: {},
  },
});

// later
settingsAtom.update({
  isLoaded: true,
  settings: {
    websiteName: "My Website Name",
  },
});

console.log(userAtom.get("settings.websiteName")); // My Website Name
```

After Defining it

```ts
import { createAtom } from "@mongez/atom-react";

const settingsAtom = createAtom({
  key: "settings",
  default: {
    isLoaded: false,
    settings: {},
  },
  get(key: string, defaultValue: any = null, atomValue: any) {
    return atomValue[key] !== undefined
      ? atomValue[key]
      : atomValue.settings[key] !== undefined
      ? atomValue.settings[key]
      : defaultValue;
  },
});

// later
settingsAtom.update({
  isLoaded: true,
  settings: {
    websiteName: "My Website Name",
  },
});

console.log(settingsAtom.get("websiteName")); // My Website Name
```

## Listen to atom value changes

This is what happens with `useAtom` hook, it listens to the atom's value change using `onChange` method.

```ts
// anywhere in your app
import { currencyAtom } from "~/src/atoms";

currencyAtom.onChange((newValue, oldValue, atom) => {
  //
});
```

> Please note the `onChange` is returning an [EventSubscription](https://github.com/hassanzohdy/mongez-events#unsubscribe-to-event) instance, we can remove the listener anytime, for example when unmounting the component.

```ts
// anywhere in your app
import { currencyAtom } from "~/src/atoms";

// in your component...
const [currency, setCurrency] = useState(currencyAtom.value);
useEffect(() => {
  const onCurrencyChange = currencyAtom.onChange(setCurrency);
  return () => onCurrencyChange.unsubscribe();
}, []);
```

## Watch For Partial Change

Sometimes you may need to watch for only a key in the atom's value object, the `atom.watch` function is the perfect way to achieve this.

> Please note this only works if the atom's default is an object or an array.

```ts
// anywhere in your app
import { createAtom } from "@mongez/atom";

const userAtom = createAtom({
  key: "user",
  default: {
    key: "Hasan",
    address: {
      city: "New York",
    },
  },
});

userAtom.watch("key", (newName, oldName) => {
  console.log(newName, oldName); // 'Hasan', 'Ali'
});

// later in the app
userAtom.update({
  ...userAtom.value,
  key: "Ali",
});
```

> Dot notation is allowed too.

```ts
// anywhere in your app
import { createAtom } from "@mongez/atom";

const userAtom = createAtom({
  key: "user",
  default: {
    key: "Hasan",
    address: {
      city: "New York",
    },
  },
});

userAtom.watch("address.cty", (newCity, oldCity) => {
  console.log(newName, oldName); // 'New York', 'Cairo'
});

// later in the app
userAtom.update({
  ...userAtom.value,
  address: {
    ...userAtom.value.address,
    city: "Cairo",
  },
});
```

## Value Mutation Before Update

Sometimes it's useful to mutate the value before updating it in the atom, this can be achieved via defining `beforeUpdate` method in the atom declaration.

This is very useful especially when dealing with objects/arrays and you want to make some operations before using the final value.

`beforeUpdate(newValue: any, oldValue: any, atom: Atom)`

```ts
import { createAtom, Atom } from "@mongez/atom";

export const multipleAtom: Atom = createAtom({
  key: "multiple",
  default: 0,
  beforeUpdate(newNumber: number): number {
    return newNumber * 2;
  },
});

multipleAtom.update(4);

console.log(multipleAtom.value); // 8
```

## Listen to atom destruction

To detect atom destruction when `destroy()` method, use `onDestroy`.

```ts
// anywhere in your app
import { currencyAtom } from "~/src/atoms";

const subscription = currencyAtom.onDestroy((atom) => {
  //
});
```

## Atom Type

We can get the type of the atom's value using `atom.type` property.

```tsx
const currencyAtom = createAtom({
  key: "currency",
  default: "USD",
});

console.log(currencyAtom.type); // string
```

If the default value is an array it will be returned as array not object.

```tsx
const todoListAtom = createAtom({
  key: "todo",
  default: [],
});

console.log(todoListAtom.type); // array
```

## Atom Actions

Sometimes, atoms need to have some actions that can be used to manipulate the atom's value, this can be achieved by defining `actions` object in the atom declaration.

```ts
import { createAtom, Atom } from "@mongez/atom";

export const userAtom: Atom = createAtom({
  key: "user",
  default: {
    name: "Hasan",
    age: 30,
    email: "",
  },
  actions: {
    changeName(name: string) {
      this.update({
        ...this.value,
        name,
      });
    },
    changeEmail(email: string) {
      this.update({
        ...this.value,
        email,
      });
    },
  },
});

// later in the app

userAtom.changeName("Ahmed");
userAtom.changeEmail("");
```

> All action methods are bound to the atom object itself, so feel free to use `this` to access the atom's object.

So basically the idea here is simple, we add the actions to the atom's declaration, then we can use these actions to manipulate the atom's value, this is super useful when we have a complex atom that needs to be manipulated in a specific way or if we want to enrich the atom with some actions.

> Please note that actions are meant to extend atom functionality, but keep in mind to keep it simple and clean.

### Override existing atom methods

Actions can be used also to override existing atom functions like `atom.get()` for example.

```ts
import { createAtom, Atom } from "@mongez/atom";

export const userAtom: Atom = createAtom({
  key: "user",
  default: {
    name: "Hasan",
    age: 30,
    email: "",
  },
  actions: {
    get(key: string, defaultValue: any = null) {
      return this.value[key] || defaultValue;
    },
  },
});

// later in the app

console.log(userAtom.get("name")); // Hasan
```

> Please note this is NOT Recommended to override existing atom methods, there could edge cases for this purpose.

### Defining Actions Definition

The `createAtom` receives two generic types, the first one is the atom's value type, the second one is the actions definition type.

```ts
import { createAtom, Atom } from "@mongez/atom";

type UserActions = {
  changeName(name: string): void;
  changeEmail(email: string): void;
};

export const userAtom: Atom = createAtom<UserData, UserActions>({
  key: "user",
  default: {
    name: "Hasan",
    age: 30,
    email: "",
  },
  actions: {
    changeName(name: string) {
      this.update({
        ...this.value,
        name,
      });
    },
    changeEmail(email: string) {
      this.update({
        ...this.value,
        email,
      });
    },
  },
});
```

It's recommended to define the actions type to have a better type checking and auto-completion.

## Working with atom as arrays

To treat the atom as an array, we will need to use the `atomCollection` function instead of `createAtom`, it provides more array functions that will help us to manipulate the atom's value.

```ts
import { atomCollection } from "@mongez/atom";

const todoListAtom = atomCollection({
  key: "todo",
  default: [],
});
```

Now we can use the following functions to manipulate the atom's value.

### Add item to the end of the array

```ts
todoListAtom.push("Buy Milk");
```

> It can accept multiple items to add.

```ts
todoListAtom.push("Buy Milk", "Buy Bread");
```

### Add item to the beginning of the array

```ts
todoListAtom.unshift("Buy Milk");
```

> It can accept multiple items to add.

```ts
todoListAtom.unshift("Buy Milk", "Buy Bread");
```

### Remove item from the end of the array

```ts
todoListAtom.pop();
```

### Remove item from the beginning of the array

```ts
todoListAtom.shift();
```

### Update item in the array

```ts
todoListAtom.replace(0, "Buy Bread");
```

### Get item from the array

There are two ways to get an item from the array, either by sending the item index, or passing a callback to find the item with:

```ts
// by index
console.log(todoListAtom.get(0)); // Buy Milk

// by callback
console.log(todoListAtom.get((item) => item === "Buy Milk")); // Buy Milk
```

If the item is not found, it will return `undefined`.

### Remove item from the array

We can either pass the item index or a callback to remove the item from the array.

```ts
// by index
todoListAtom.remove(0);

// by callback
todoListAtom.remove((item) => item === "Buy Milk");
```

### Remove item from the array by index

To remove the itm from the array using the item itself, just pass it to `removeItem` method:

```ts
todoListAtom.removeItem("Buy Milk");
```

This will remove the first found item in the array.

### Remove all found items from the array

If element possibly exists more than once in the array, we can remove all of them using `removeAll` method.

```ts
todoListAtom.removeAll("Buy Milk");
```

### Map over the array

The `map` method will update the atom's array with the new array.

```ts
todoListAtom.map((item) => item.toUpperCase());
```

### Get the array length

```ts
console.log(todoListAtom.length); // 2
```

### Reset the array

Just use the normal `reset` method.

## Change Log

## V1.0.0 (12 May 2024)

- Initial release
