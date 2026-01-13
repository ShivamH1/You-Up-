"use client";

import { nanoid } from "nanoid";
import { useEffect, useState } from "react";

const ANIMALS = ["lion", "tiger", "bear", "eagle", "shark", "wolf"];
const STORAGE_KEY = "chat_username";

function generateUsername() {
  const word = ANIMALS[Math.floor(Math.random() * ANIMALS.length)];
  return `anonymous-${word}-${nanoid(5)}`;
}

export const useUsername = () => {
  const [username, setUsername] = useState("");
  useEffect(() => {
    const main = () => {
      const stored = localStorage.getItem(STORAGE_KEY);

      if (stored) {
        setUsername(stored);
        return;
      }

      const generated = generateUsername();
      setUsername(generated);
      localStorage.setItem(STORAGE_KEY, generated);
    };

    main();
  }, []);

  return { username, setUsername };
};
