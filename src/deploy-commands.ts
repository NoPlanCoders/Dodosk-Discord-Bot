import { REST, Routes, SlashCommandBuilder } from "discord.js";
import { env } from "./env.js";

const commands = [
  new SlashCommandBuilder()
    .setName("setup")
    .setDescription("Create your marketplace account"),

  new SlashCommandBuilder()
    .setName("profile")
    .setDescription("Check your marketplace account status"),

  new SlashCommandBuilder()
    .setName("market")
    .setDescription("Show the marketplace URL")
].map((command) => command.toJSON());

const rest = new REST({ version: "10" }).setToken(env.discordToken);

await rest.put(
  Routes.applicationGuildCommands(env.discordClientId, env.discordGuildId),
  { body: commands }
);

console.log("Commands deployed.");
