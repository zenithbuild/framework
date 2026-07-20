export const peopleCollection = {
  name: "people",
  label: "People",
  path: "site/src/content/people",
  format: "json",
  fields: [
    { type: "string", name: "name", label: "Display name", isTitle: true, required: true },
    { type: "string", name: "profileUrl", label: "Public profile URL", required: true },
    {
      type: "object",
      name: "avatar",
      label: "Avatar",
      fields: [
        { type: "image", name: "src", label: "Image" },
        { type: "number", name: "width", label: "Width" },
        { type: "number", name: "height", label: "Height" },
        { type: "string", name: "alt", label: "Alt text" },
        { type: "string", name: "focalPosition", label: "Focal position" },
      ],
    },
    { type: "boolean", name: "member", label: "Organization member" },
    { type: "boolean", name: "contributor", label: "Contributor" },
    { type: "boolean", name: "active", label: "Active" },
    { type: "number", name: "sortOrder", label: "Sort order" },
  ],
};
